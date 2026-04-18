import os
import sys
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage

def test():
    print("Testing LLM Connection...")
    try:
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            temperature=0,
            api_key=os.environ.get("GEMINI_API_KEY")
        )
        msg = HumanMessage(content="Respond concisely: Are you successfully connected to the GNOSIS Multi-Agent python backend via LangChain?")
        response = llm.invoke([msg])
        print("Success! LLM Response:")
        print(response.content)
    except Exception as e:
        print("Error connecting to LLM:")
        print(e)
        sys.exit(1)

if __name__ == "__main__":
    test()
