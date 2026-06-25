"""
Tests for the LangGraph ReAct agent:
  - agent_tools: search_knowledge_base, create_lead, create_followup, handoff_to_human
  - agent_graph: run_agent, billing deduction, MAX_ITERATIONS guard
  - ai_agent: fast-path exits (ai_disabled, no api_key, keyword handoff)

All tests mock the Anthropic API — no real network calls.
"""
import pytest
from decimal import Decimal
from unittest.mock import MagicMock, patch

from conversations.models import Channel, Contact, Conversation, Message
from contacts.models import Lead, FollowUp
from billing.models import CreditAccount, CreditTransaction


# ── Fixtures ──────────────────────────────────────────────────────

@pytest.fixture
def channel(db):
    return Channel.objects.create(
        name='Test Channel',
        type='website',
        is_active=True,
        credentials={
            'widget_key': 'web_tests',
            'ai_enabled': True,
            'ai_model': 'claude-haiku-4-5-20251001',
            'ai_max_tokens': 256,
            'ai_context_messages': 5,
            'ai_handoff_keywords': 'quiero un agente,hablar con humano',
        },
    )


@pytest.fixture
def contact(db, channel):
    return Contact.objects.create(
        name='Cliente Test',
        external_id='test_ext_001',
        channel=channel,
    )


@pytest.fixture
def conversation(db, channel, contact):
    return Conversation.objects.create(
        channel=channel,
        contact=contact,
        status='active',
        ai_active=True,
    )


@pytest.fixture(autouse=True)
def _clear_model_cache():
    """The ChatAnthropic client cache is module-level; clear it between tests
    so a patched mock from one test never leaks into the next."""
    from integrations.services import agent_graph
    agent_graph._chat_clients.clear()
    yield
    agent_graph._chat_clients.clear()


@pytest.fixture
def credit_account(db):
    account = CreditAccount.get_solo()
    account.balance_usd = Decimal('10.0000')
    account.markup_multiplier = Decimal('1.0')  # no markup in tests
    account.save()
    return account


@pytest.fixture
def relevance_off(db):
    """Disable the relevance gate so tests exercise the agent loop in
    isolation (the gate adds an extra model call + its own tokens)."""
    from accounts.models import Workspace
    ws = Workspace.get_solo()
    ws.relevance_filter_enabled = False
    ws.save()
    return ws


# ── Tools: search_knowledge_base ─────────────────────────────────

@pytest.mark.django_db
class TestSearchKnowledgeBaseTool:
    def test_returns_matching_docs(self, db):
        from knowledge.models import KnowledgeDoc
        KnowledgeDoc.objects.create(title='Precios', content='Plan Pro: $299/mes', is_active=True, order=1)
        KnowledgeDoc.objects.create(title='Soporte', content='Lunes a viernes', is_active=True, order=2)

        from integrations.services.agent_tools import search_knowledge_base
        result = search_knowledge_base.invoke({'query': 'precio'})
        assert 'Precios' in result
        assert '$299' in result
        assert 'Soporte' not in result  # non-matching doc excluded

    def test_returns_all_docs_when_no_keyword_match(self, db):
        from knowledge.models import KnowledgeDoc
        KnowledgeDoc.objects.create(title='Doc A', content='Contenido A', is_active=True)
        KnowledgeDoc.objects.create(title='Doc B', content='Contenido B', is_active=True)

        from integrations.services.agent_tools import search_knowledge_base
        result = search_knowledge_base.invoke({'query': 'xyz_no_match'})
        assert 'Doc A' in result or 'Doc B' in result

    def test_returns_fallback_when_no_docs(self, db):
        from integrations.services.agent_tools import search_knowledge_base
        result = search_knowledge_base.invoke({'query': 'precio'})
        assert 'No hay información' in result

    def test_inactive_docs_excluded(self, db):
        from knowledge.models import KnowledgeDoc
        KnowledgeDoc.objects.create(title='Activo', content='precio activo', is_active=True)
        KnowledgeDoc.objects.create(title='Inactivo', content='precio inactivo', is_active=False)

        from integrations.services.agent_tools import search_knowledge_base
        result = search_knowledge_base.invoke({'query': 'precio'})
        assert 'Activo' in result
        assert 'Inactivo' not in result


# ── Tools: create_lead ────────────────────────────────────────────

@pytest.mark.django_db
class TestCreateLeadTool:
    def test_creates_lead_with_correct_data(self, conversation):
        from integrations.services.agent_tools import create_lead
        result = create_lead.invoke({
            'notes': 'Interesado en Plan Pro',
            'stage': 'qualified',
            'conversation_id': conversation.id,
        })
        assert 'creado' in result
        lead = Lead.objects.get(contact=conversation.contact)
        assert lead.stage == 'qualified'
        assert 'Plan Pro' in lead.notes

    def test_updates_existing_lead_for_same_contact(self, conversation):
        from integrations.services.agent_tools import create_lead
        create_lead.invoke({'notes': 'Primera nota', 'conversation_id': conversation.id})
        create_lead.invoke({'notes': 'Nota actualizada', 'stage': 'proposal', 'conversation_id': conversation.id})
        assert Lead.objects.filter(contact=conversation.contact).count() == 1
        lead = Lead.objects.get(contact=conversation.contact)
        assert lead.notes == 'Nota actualizada'
        assert lead.stage == 'proposal'

    def test_returns_error_for_invalid_conversation(self, db):
        from integrations.services.agent_tools import create_lead
        result = create_lead.invoke({'notes': 'test', 'conversation_id': 99999})
        assert 'No se pudo' in result


# ── Tools: create_followup ────────────────────────────────────────

@pytest.mark.django_db
class TestCreateFollowupTool:
    def test_creates_followup_with_correct_data(self, conversation):
        from integrations.services.agent_tools import create_followup
        result = create_followup.invoke({
            'reason': 'Llamar el viernes a las 4pm',
            'priority': 'high',
            'conversation_id': conversation.id,
        })
        assert 'agendado' in result
        followup = FollowUp.objects.get(conversation=conversation)
        assert followup.priority == 'high'
        assert followup.status == 'open'
        assert 'viernes' in followup.reason

    def test_default_priority_is_medium(self, conversation):
        from integrations.services.agent_tools import create_followup
        create_followup.invoke({'reason': 'Contactar', 'conversation_id': conversation.id})
        followup = FollowUp.objects.get(conversation=conversation)
        assert followup.priority == 'medium'

    def test_returns_error_for_invalid_conversation(self, db):
        from integrations.services.agent_tools import create_followup
        result = create_followup.invoke({'reason': 'test', 'conversation_id': 99999})
        assert 'No se pudo' in result


# ── Tools: handoff_to_human ───────────────────────────────────────

class TestHandoffTool:
    def test_returns_command_with_should_handoff_true(self):
        from langgraph.types import Command
        from integrations.services.agent_tools import handoff_to_human

        # InjectedToolCallId requires the full ToolCall dict format
        result = handoff_to_human.invoke({
            'args': {'reason': 'Cliente solicita hablar con humano'},
            'name': 'handoff_to_human',
            'type': 'tool_call',
            'id': 'test_tool_call_id_001',
        })
        assert isinstance(result, Command)
        assert result.update.get('should_handoff') is True
        # Must include ToolMessage to satisfy LangGraph invariant
        messages = result.update.get('messages', [])
        assert len(messages) == 1
        from langchain_core.messages import ToolMessage
        assert isinstance(messages[0], ToolMessage)


# ── ai_agent: fast-path exits ─────────────────────────────────────

@pytest.mark.django_db
class TestAiAgentFastPaths:
    def test_returns_none_when_ai_disabled(self, channel, conversation):
        channel.credentials = {**channel.credentials, 'ai_enabled': False}
        channel.save()
        from integrations.services.ai_agent import get_ai_response
        reply, handoff = get_ai_response(channel, conversation, 'hola')
        assert reply is None
        assert handoff is False

    def test_returns_none_when_no_api_key(self, channel, conversation):
        from integrations.services.ai_agent import get_ai_response
        with patch('django.conf.settings.ANTHROPIC_API_KEY', ''):
            reply, handoff = get_ai_response(channel, conversation, 'hola')
        assert reply is None
        assert handoff is False

    def test_keyword_handoff_before_graph(self, channel, conversation):
        from integrations.services.ai_agent import get_ai_response
        with patch('django.conf.settings.ANTHROPIC_API_KEY', 'sk-ant-test'):
            reply, handoff = get_ai_response(channel, conversation, 'quiero un agente ahora')
        assert reply is None
        assert handoff is True

    def test_keyword_match_is_case_insensitive(self, channel, conversation):
        from integrations.services.ai_agent import get_ai_response
        with patch('django.conf.settings.ANTHROPIC_API_KEY', 'sk-ant-test'):
            reply, handoff = get_ai_response(channel, conversation, 'QUIERO UN AGENTE')
        assert handoff is True

    def test_non_keyword_message_reaches_graph(self, channel, conversation, credit_account):
        from integrations.services.ai_agent import get_ai_response
        with patch('django.conf.settings.ANTHROPIC_API_KEY', 'sk-ant-test'):
            with patch('integrations.services.agent_graph.run_agent', return_value=('mock reply', False)) as mock_run:
                reply, handoff = get_ai_response(channel, conversation, '¿cuánto cuesta?')
        mock_run.assert_called_once()
        assert reply == 'mock reply'


# ── agent_graph: run_agent with mocked Claude ─────────────────────

def _make_ai_message(content, tool_calls=None, input_tokens=100, output_tokens=50):
    """Build a mock AIMessage that mimics langchain_anthropic output."""
    from langchain_core.messages import AIMessage
    msg = AIMessage(content=content)
    msg.tool_calls = tool_calls or []
    msg.usage_metadata = {'input_tokens': input_tokens, 'output_tokens': output_tokens}
    return msg


@pytest.mark.django_db
class TestRunAgent:
    def _mock_model(self, return_value=None, side_effect=None):
        """Helper: returns a mock that mimics ChatAnthropic(...).bind_tools(...)."""
        mock = MagicMock()
        mock.bind_tools.return_value = mock
        if side_effect:
            mock.invoke.side_effect = side_effect
        else:
            mock.invoke.return_value = return_value
        return mock

    def test_returns_reply_and_no_handoff_on_simple_response(self, channel, conversation, credit_account):
        ai_msg = _make_ai_message('Hola, ¿en qué puedo ayudarte?', input_tokens=200, output_tokens=30)
        mock_model = self._mock_model(return_value=ai_msg)

        with patch('django.conf.settings.ANTHROPIC_API_KEY', 'sk-ant-test'):
            with patch('integrations.services.agent_graph.ChatAnthropic', return_value=mock_model):
                from integrations.services.agent_graph import run_agent
                reply, handoff = run_agent(channel, conversation, 'hola')

        assert reply == 'Hola, ¿en qué puedo ayudarte?'
        assert handoff is False

    def test_billing_deducted_after_successful_call(self, channel, conversation, credit_account, relevance_off):
        ai_msg = _make_ai_message('respuesta', input_tokens=500, output_tokens=100)
        mock_model = self._mock_model(return_value=ai_msg)

        with patch('django.conf.settings.ANTHROPIC_API_KEY', 'sk-ant-test'):
            with patch('integrations.services.agent_graph.ChatAnthropic', return_value=mock_model):
                from integrations.services.agent_graph import run_agent
                run_agent(channel, conversation, 'pregunta')

        txn = CreditTransaction.objects.order_by('-created_at').first()
        assert txn is not None
        assert txn.input_tokens == 500
        assert txn.output_tokens == 100
        assert txn.type == CreditTransaction.TYPE_USAGE
        assert txn.amount_usd < 0

    def test_returns_none_when_no_funds(self, channel, conversation, credit_account):
        credit_account.balance_usd = Decimal('0.0000')
        credit_account.save()

        with patch('django.conf.settings.ANTHROPIC_API_KEY', 'sk-ant-test'):
            from integrations.services.agent_graph import run_agent
            reply, handoff = run_agent(channel, conversation, 'hola')

        assert reply is None
        assert handoff is False

    def test_returns_none_on_authentication_error(self, channel, conversation, credit_account):
        from anthropic import AuthenticationError as AnthropicAuthError
        http_response = MagicMock()
        http_response.headers = {}
        http_response.status_code = 401
        error = AnthropicAuthError(
            message='invalid x-api-key',
            response=http_response,
            body={'error': {'message': 'invalid x-api-key'}},
        )
        mock_model = self._mock_model(side_effect=error)

        with patch('django.conf.settings.ANTHROPIC_API_KEY', 'sk-ant-bad'):
            with patch('integrations.services.agent_graph.ChatAnthropic', return_value=mock_model):
                from integrations.services.agent_graph import run_agent
                reply, handoff = run_agent(channel, conversation, 'hola')

        assert reply is None
        assert handoff is False
        # No billing transaction for failed calls
        assert CreditTransaction.objects.count() == 0

    def test_conversation_history_included_in_messages(self, channel, conversation, credit_account):
        Message.objects.create(conversation=conversation, role='customer', content='primer mensaje')
        Message.objects.create(conversation=conversation, role='ai', content='primera respuesta')

        captured_messages = []

        def capture_invoke(messages):
            captured_messages.extend(messages)
            return _make_ai_message('ok')

        # bind_tools() returns a RunnableBinding — mock at the ChatAnthropic constructor level
        mock_model = MagicMock()
        mock_model.bind_tools.return_value = mock_model
        mock_model.invoke.side_effect = capture_invoke

        with patch('django.conf.settings.ANTHROPIC_API_KEY', 'sk-ant-test'):
            with patch('integrations.services.agent_graph.ChatAnthropic', return_value=mock_model):
                from integrations.services.agent_graph import run_agent
                run_agent(channel, conversation, 'segundo mensaje')

        # System + at least 3 messages (history + new)
        assert len(captured_messages) >= 3
        contents = [m.content for m in captured_messages if hasattr(m, 'content')]
        assert any('primer mensaje' in c for c in contents)

    def test_tokens_accumulated_across_loop_iterations(self, channel, conversation, credit_account):
        """Billing must reflect total tokens from ALL loop iterations, not just the last."""
        call_count = {'n': 0}

        def multi_turn_invoke(messages):
            call_count['n'] += 1
            if call_count['n'] == 1:
                from langchain_core.messages import AIMessage
                msg = AIMessage(content='')
                msg.tool_calls = [{'name': 'search_knowledge_base', 'args': {'query': 'test'}, 'id': 'tc1', 'type': 'tool_call'}]
                msg.usage_metadata = {'input_tokens': 300, 'output_tokens': 20}
                return msg
            else:
                return _make_ai_message('respuesta final', input_tokens=400, output_tokens=80)

        mock_model = MagicMock()
        mock_model.bind_tools.return_value = mock_model
        mock_model.invoke.side_effect = multi_turn_invoke

        with patch('django.conf.settings.ANTHROPIC_API_KEY', 'sk-ant-test'):
            with patch('integrations.services.agent_graph.ChatAnthropic', return_value=mock_model):
                from integrations.services.agent_graph import run_agent
                run_agent(channel, conversation, 'pregunta')

        txn = CreditTransaction.objects.order_by('-created_at').first()
        assert txn is not None
        # Total: 300+400=700 input, 20+80=100 output
        assert txn.input_tokens == 700
        assert txn.output_tokens == 100


# ── MAX_ITERATIONS guard ──────────────────────────────────────────

@pytest.mark.django_db
class TestMaxIterationsGuard:
    def test_loop_stops_at_max_iterations(self, channel, conversation, credit_account, relevance_off):
        """Agent must stop calling tools after MAX_ITERATIONS even if model keeps requesting tools."""
        from integrations.services.agent_state import MAX_ITERATIONS

        call_count = {'n': 0}

        def always_tool_call(messages):
            call_count['n'] += 1
            from langchain_core.messages import AIMessage
            msg = AIMessage(content='')
            msg.tool_calls = [{'name': 'search_knowledge_base', 'args': {'query': 'loop'}, 'id': f'tc{call_count["n"]}', 'type': 'tool_call'}]
            msg.usage_metadata = {'input_tokens': 100, 'output_tokens': 10}
            return msg

        mock_model = MagicMock()
        mock_model.bind_tools.return_value = mock_model
        mock_model.invoke.side_effect = always_tool_call

        with patch('django.conf.settings.ANTHROPIC_API_KEY', 'sk-ant-test'):
            with patch('integrations.services.agent_graph.ChatAnthropic', return_value=mock_model):
                from integrations.services.agent_graph import run_agent
                reply, handoff = run_agent(channel, conversation, 'loop forever')

        # Must not have called model more than MAX_ITERATIONS times
        assert call_count['n'] <= MAX_ITERATIONS
        assert handoff is False


# ── System prompt assembly (orchestration config wiring) ──────────

@pytest.mark.django_db
class TestSystemPromptAssembly:
    """Every persona field configured in Knowledge must reach the prompt."""

    def _build(self, **fields):
        from knowledge.models import AIConfig
        from integrations.services.agent_graph import _build_system_prompt
        cfg = AIConfig.get_solo()
        for k, v in fields.items():
            setattr(cfg, k, v)
        cfg.save()
        return _build_system_prompt()

    def test_name_and_company_generate_identity_when_line_blank(self):
        prompt = self._build(
            identity_line='', agent_name='Sofía', company_name='Elevadores del Norte')
        assert 'Sofía' in prompt
        assert 'Elevadores del Norte' in prompt

    def test_explicit_identity_line_overrides_generated(self):
        prompt = self._build(
            identity_line='Eres Marco, el conserje digital.', agent_name='Sofía')
        assert 'Marco, el conserje digital' in prompt

    def test_tone_is_injected(self):
        prompt = self._build(tone='cálido y directo', agent_name='Ana')
        assert 'cálido y directo' in prompt

    def test_gender_note_injected_for_female(self):
        prompt = self._build(agent_gender='female', agent_name='Ana', identity_line='')
        assert 'femenino' in prompt

    def test_overview_and_rules_present(self):
        prompt = self._build(
            overview='Vendemos elevadores.',
            behavior_rules=['Saluda primero.', 'Sé breve.'])
        assert 'CONTEXTO DEL NEGOCIO' in prompt
        assert 'Vendemos elevadores.' in prompt
        assert 'REGLAS DE COMPORTAMIENTO' in prompt
        assert 'Saluda primero.' in prompt

    def test_tools_always_appended(self):
        prompt = self._build(agent_name='Ana')
        assert 'search_knowledge_base' in prompt
        assert 'create_lead' in prompt


# ── Credits never go negative (C2) ────────────────────────────────

@pytest.mark.django_db
class TestCreditClamp:
    def test_balance_clamped_at_zero(self, channel, credit_account):
        credit_account.balance_usd = Decimal('0.0001')
        credit_account.save()
        from integrations.services.agent_graph import _deduct_credits
        # Cost far exceeds the remaining balance.
        _deduct_credits(channel, 'claude-haiku-4-5-20251001', 1_000_000, 1_000_000)
        credit_account.refresh_from_db()
        assert credit_account.balance_usd == Decimal('0.0000')
        tx = CreditTransaction.objects.order_by('-created_at').first()
        assert tx is not None and tx.amount_usd < 0  # true cost still recorded
        assert tx.balance_after == Decimal('0.0000')


# ── Custom tools reach the agent graph and execute ────────────────

@pytest.mark.django_db
class TestCustomToolIntegration:
    def test_active_custom_tool_is_executed_by_graph(self, channel, conversation, credit_account, relevance_off):
        """An active custom tool is bound to the agent and executed when called.

        ToolNode runs tools in a worker thread; under pytest's per-test
        transaction that thread can't see uncommitted rows, so we assert the
        dispatcher was invoked (in-memory spy) rather than querying the run log.
        (Cross-thread DB writes work in production, which runs autocommit.)
        """
        from knowledge.models import CustomTool
        from integrations.services import agent_graph, custom_tools

        CustomTool.objects.create(
            name='agendar_visita', description='Agenda una visita técnica',
            archetype='collect_data',
            parameters=[{'name': 'fecha', 'type': 'string', 'required': True}],
            is_active=True)

        tool_call_msg = _make_ai_message('', tool_calls=[
            {'name': 'agendar_visita', 'args': {'fecha': 'martes 10am'}, 'id': 'tc1', 'type': 'tool_call'}])
        final_msg = _make_ai_message('Tu visita quedó registrada.')

        mock_model = MagicMock()
        mock_model.bind_tools.return_value = mock_model
        mock_model.invoke.side_effect = [tool_call_msg, final_msg]

        agent_graph._graph_cache.clear()  # rebuild with the new tool set

        calls = []
        orig_dispatch = custom_tools._dispatch
        def spy(ct, args):
            calls.append((ct.name, args))
            return 'ok'

        with patch('django.conf.settings.ANTHROPIC_API_KEY', 'sk-ant-test'):
            with patch('integrations.services.agent_graph.ChatAnthropic', return_value=mock_model):
                with patch.object(custom_tools, '_dispatch', spy):
                    reply, handoff = agent_graph.run_agent(channel, conversation, 'quiero una visita')

        assert reply == 'Tu visita quedó registrada.'
        assert handoff is False
        assert calls == [('agendar_visita', {'fecha': 'martes 10am'})]
        custom_tools._dispatch = orig_dispatch
