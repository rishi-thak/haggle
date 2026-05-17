# Multi-Agent Hackathon

## Project Overview

This is a hackathon workspace for building and deploying AI agents on AWS. You are helping a participant build a multi-agent system using Strands Agents SDK, then deploy it to Amazon Bedrock AgentCore.

## Environment

- AWS Region: us-east-1
- Claude Code runs on Amazon Bedrock (Mantle endpoint)
- Python 3.11+ with strands-agents, boto3, fastapi pre-installed
- AgentCore Starter Toolkit CLI available (`agentcore` command)
- Working directories: `/workshop/lab-1/` (build agents), `/workshop/lab-2/` (deploy to AgentCore)

## Tech Stack

- **Agent Framework**: Strands Agents SDK (`from strands import Agent`, `from strands.tools import tool`)
- **Orchestration**: Strands multiagent patterns (`from strands.multiagent import GraphBuilder, SwarmBuilder, WorkflowBuilder`)
- **Model**: Amazon Bedrock - Claude Sonnet (`us.anthropic.claude-sonnet-4-5-20250929-v1:0`)
- **Deployment**: Amazon Bedrock AgentCore (Runtime, Identity, Memory, Observability)
- **Web UI**: FastAPI + Server-Sent Events for real-time dashboards

## Coding Conventions

- Use `@tool` decorator from `strands.tools` for all agent tools
- Type-hint all tool function parameters (Strands uses these for the tool schema)
- Each agent in its own file under `agents/`
- Each tool module under `tools/`
- Config in `config.py` using environment variables with sensible defaults
- Use `python-dotenv` for `.env` file loading

## Strands Agent Pattern

```python
from strands import Agent
from strands.tools import tool

@tool
def my_tool(param: str) -> dict:
    """Tool description used by the LLM to decide when to call it."""
    return {"result": "value"}

agent = Agent(
    model="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    system_prompt="You are a specialized agent that...",
    tools=[my_tool]
)

result = agent("Do the thing")
```

## AgentCore Deployment Pattern

```python
from agentcore import App

app = App()

@app.handler
def handler(event, context):
    result = agent(event["input"])
    return {"output": str(result)}
```

Deploy with: `agentcore create` → `agentcore dev` (local test) → `agentcore deploy` (production)

## Key Commands

- Run tests: `python -m pytest`
- Start dashboard: `uvicorn server:app --host 0.0.0.0 --port 8000`
- Deploy to AgentCore: `agentcore deploy`
- Invoke deployed agent: `agentcore invoke --payload '{"input": "..."}'`

## Common Mistakes to Avoid

- Don't forget `flush=True` on print statements when streaming output via SSE
- Strands tool functions must have docstrings (used as tool descriptions)
- All tool parameters must be type-hinted (Strands generates JSON schema from them)
- Use `boto3` for AWS service calls, not raw HTTP
- AgentCore Runtime expects the `@app.handler` entry point pattern
