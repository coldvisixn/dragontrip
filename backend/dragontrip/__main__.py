import os
import socket
import uvicorn
from .app import create_app

def main():
    os.umask(0o077)
    token = os.environ.pop("DRAGONTRIP_TOKEN", "")
    dev = os.environ.get("DRAGONTRIP_DEV") == "1"
    app = create_app(token, dev=dev)
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    sock.listen(128)
    print(f"DRAGONTRIP_READY {sock.getsockname()[1]}", flush=True)
    uvicorn.Server(uvicorn.Config(app, log_level="warning", access_log=False)).run(sockets=[sock])

if __name__ == "__main__":
    main()
