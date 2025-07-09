#!/usr/bin/env python3
"""Simple HTTP server for testing WebAssembly examples"""

import http.server
import socketserver
import os
import sys

class WasmHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add CORS headers for local development
        self.send_header('Access-Control-Allow-Origin', '*')

        # Set proper MIME types
        if self.path.endswith('.wasm'):
            self.send_header('Content-Type', 'application/wasm')
        elif self.path.endswith('.js'):
            self.send_header('Content-Type', 'application/javascript')

        super().end_headers()

def main():
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass

    # Serve from project root
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    print(f"Starting server on http://localhost:{port}")
    print(f"Open: http://localhost:{port}/examples/web-example.html")
    print("Press Ctrl+C to stop")

    try:
        with socketserver.TCPServer(("", port), WasmHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")

if __name__ == "__main__":
    main()
