from typing import Annotated, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages

MAX_ITERATIONS = 5


class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    channel_id: int
    conversation_id: int
    model: str
    max_tokens: int
    should_handoff: bool
    total_input_tokens: int
    total_output_tokens: int
