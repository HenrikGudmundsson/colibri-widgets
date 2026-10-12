import os

# agent_backend.config reads these when it is first imported. Nothing here
# calls the model, and nothing listens on port 1: the tests run without a
# database, and can never write to a real one.
os.environ["ANTHROPIC_API_KEY"] = "test"
os.environ["DATABASE_URL"] = "postgresql://agent:agent@127.0.0.1:1/agent_backend"
