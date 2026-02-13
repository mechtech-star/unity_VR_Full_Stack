"""Simple middleware to ensure CORS headers are present on responses.

This is a small fallback for dev mode to ensure media/static responses
include Access-Control-Allow-Origin so WebGL texture loaders that set
`crossOrigin` succeed during development.
"""
from typing import Callable

class CustomCORS:
    def __init__(self, get_response: Callable):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        # Only add header if not already present
        if not response.get('Access-Control-Allow-Origin'):
            response['Access-Control-Allow-Origin'] = '*'
        return response
