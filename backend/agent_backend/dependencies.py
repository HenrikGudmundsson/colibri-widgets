from agent_backend.db.repository import ConversationRepository
from agent_backend.guard import Guard


def get_conversation_repository():
    return ConversationRepository()


def get_guard():
    return Guard()
