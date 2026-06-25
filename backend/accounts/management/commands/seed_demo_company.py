"""
Seed a demo company to prove the platform is fully configurable (no hardcoding).

Usage:
  python manage.py seed_demo_company \
      --company "Elevadores del Norte" \
      --email alertas@elevadoresnorte.mx \
      --warning 10 --critical 15 --escalate 20

Creates the Workspace business rules + 1 admin + 4 agents (5 employees total),
each with a login. Idempotent: re-running updates rather than duplicating.
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from accounts.models import Agent, Workspace
from conversations.models import Channel
from knowledge.models import AIConfig, KnowledgeDoc, CustomTool

User = get_user_model()

DEMO_TEAM = [
    # (display_name, role, availability)
    ('Laura Admin',    Agent.ROLE_ADMIN,      Agent.AVAIL_ONLINE),
    ('Diego Supervisor', Agent.ROLE_SUPERVISOR, Agent.AVAIL_ONLINE),
    ('Ana García',     Agent.ROLE_AGENT,      Agent.AVAIL_ONLINE),
    ('Carlos Ruiz',    Agent.ROLE_AGENT,      Agent.AVAIL_BUSY),
    ('María López',    Agent.ROLE_AGENT,      Agent.AVAIL_AWAY),
]


class Command(BaseCommand):
    help = 'Seed a configurable demo company (workspace rules + 5 employees).'

    def add_arguments(self, parser):
        parser.add_argument('--company', default='Elevadores del Norte')
        parser.add_argument('--email', default='alertas@empresademo.mx')
        parser.add_argument('--domain', default='empresademo.mx')
        parser.add_argument('--password', default='Demo1234!')
        parser.add_argument('--warning', type=int, default=10)
        parser.add_argument('--critical', type=int, default=15)
        parser.add_argument('--escalate', type=int, default=20)
        parser.add_argument('--agent-name', default='Sara', dest='agent_name')
        parser.add_argument('--no-ai', action='store_true',
                            help='No sembrar la configuración de IA (persona, reglas, documentos).')

    def handle(self, *args, **o):
        ws = Workspace.get_solo()
        ws.company_name = o['company']
        ws.sla_warning_minutes = o['warning']
        ws.sla_critical_minutes = o['critical']
        ws.sla_escalate_minutes = o['escalate']
        ws.escalation_enabled = True
        ws.escalation_email = o['email']
        ws.alert_on_dashboard = True
        ws.relevance_filter_enabled = True
        ws.save()
        self.stdout.write(self.style.SUCCESS(
            f"Workspace '{ws.company_name}' — SLA {ws.sla_warning_minutes}/"
            f"{ws.sla_critical_minutes}/{ws.sla_escalate_minutes} min → {ws.escalation_email}"))

        channels = list(Channel.objects.all())
        for i, (name, role, avail) in enumerate(DEMO_TEAM):
            slug = name.lower().split()[0]
            username = f'{slug}@{o["domain"]}'
            user, _ = User.objects.get_or_create(
                username=username, defaults={'email': username, 'first_name': name.split()[0]})
            user.set_password(o['password'])
            user.is_active = True
            user.save()

            agent, _ = Agent.objects.update_or_create(
                user=user,
                defaults={'display_name': name, 'role': role, 'availability': avail,
                          'is_active': True, 'max_concurrent': 5},
            )
            # Agents attend all channels; admins/supervisors too for the demo.
            if channels:
                agent.channels.set(channels)
            self.stdout.write(f'  · {name} ({role}) — {username}')

        # ── AI configuration (Knowledge / orquestación) ─────────────
        # Demuestra que la persona, las reglas y los documentos del agente
        # son 100% configurables por empresa — no hay nada hardcodeado.
        if not o['no_ai']:
            company = o['company']
            agent_name = o['agent_name']
            cfg = AIConfig.get_solo()
            cfg.agent_name = agent_name
            cfg.agent_gender = 'female'
            cfg.company_name = company
            cfg.tone = 'cálido, profesional y resolutivo, sin tecnicismos innecesarios'
            cfg.identity_line = ''  # se genera con Nombre + Empresa
            cfg.agent_description = (
                f'Atiendes a clientes de {company} por todos los canales. Tu objetivo es '
                'resolver dudas, calificar interesados y agendar seguimientos, derivando a un '
                'humano cuando hace falta.'
            )
            cfg.overview = (
                f'{company} instala y da mantenimiento a elevadores residenciales, comerciales '
                'e industriales. Cobertura nacional, servicio de emergencia 24/7 y financiamiento '
                'a meses. Atiende a desarrolladores, administradores de edificios y particulares.'
            )
            cfg.behavior_rules = [
                'Saluda por su nombre al cliente si lo conoces.',
                'Busca en la base de conocimiento antes de responder cualquier pregunta de negocio.',
                'Si el cliente quiere cotizar, comprar o menciona un proyecto, llama create_lead de inmediato.',
                'Si el cliente pide que lo llamen o agenda una visita, llama create_followup.',
                'Para quejas urgentes o solicitudes de hablar con una persona, usa handoff_to_human.',
                'Sé conciso. Nunca prometas una acción sin ejecutarla con su herramienta.',
            ]
            cfg.language_policy = 'mirror'
            cfg.supported_languages = 'es, en'
            cfg.save()
            self.stdout.write(self.style.SUCCESS(
                f"Config IA → agente '{agent_name}' de {company}, "
                f"{len(cfg.behavior_rules)} reglas, idioma espejo."))

            demo_docs = [
                ('Productos y servicios',
                 f'{company} ofrece elevadores residenciales (hasta 6 paradas), comerciales e '
                 'industriales, además de mantenimiento preventivo y modernización de equipos '
                 'existentes. Todos los equipos cumplen la NOM vigente.'),
                ('Cobertura y horarios',
                 'Servicio en toda la república. Atención comercial de lunes a viernes de 9:00 a '
                 '18:00 y servicio de emergencia 24/7 para clientes con contrato de mantenimiento.'),
                ('Cotizaciones y financiamiento',
                 'Las cotizaciones requieren tipo de proyecto, número de paradas y ubicación. '
                 'Hay financiamiento de 12 a 48 meses con aprobación sujeta a buró.'),
            ]
            for i, (title, content) in enumerate(demo_docs):
                KnowledgeDoc.objects.update_or_create(
                    title=title, defaults={'content': content, 'order': i, 'is_active': True})
            self.stdout.write(self.style.SUCCESS(
                f'Base de conocimiento → {len(demo_docs)} documentos.'))

            CustomTool.objects.update_or_create(
                name='agendar_visita_tecnica',
                defaults={
                    'display_name': 'Agendar visita técnica',
                    'description': ('Agenda una visita técnica cuando el cliente quiere que un '
                                    'especialista revise su elevador o proyecto en sitio.'),
                    'archetype': CustomTool.ARCHETYPE_COLLECT,
                    'parameters': [
                        {'name': 'direccion', 'type': 'string', 'required': True,
                         'description': 'Dirección donde se hará la visita'},
                        {'name': 'fecha_preferida', 'type': 'string', 'required': True,
                         'description': 'Fecha y hora preferida por el cliente'},
                        {'name': 'tipo_equipo', 'type': 'string', 'required': False,
                         'description': 'Tipo de elevador o equipo'},
                    ],
                    'is_active': True,
                    'review_status': CustomTool.STATUS_DRAFT,
                },
            )
            self.stdout.write(self.style.SUCCESS(
                'Herramienta personalizada → agendar_visita_tecnica (capturar datos).'))

        self.stdout.write(self.style.SUCCESS(
            f'\nListo. {len(DEMO_TEAM)} empleados. Password demo: {o["password"]}'))
