"""HTTPS transport for Supabase JSON APIs in both ASGI runtimes."""
from io import BytesIO
import sys
from urllib.error import HTTPError, URLError
from urllib.request import urlopen


def open_http(request, *, timeout, opener=urlopen):
    if sys.platform != "emscripten":
        return opener(request, timeout=timeout)

    from js import AbortSignal, Object, fetch
    from pyodide.ffi import JsException, run_sync, to_js

    options = {
        "method": request.get_method(),
        "headers": dict(request.header_items()),
        "redirect": "manual",
        "signal": AbortSignal.timeout(round(timeout * 1000)),
    }
    if request.data is not None:
        options["body"] = request.data.decode("utf-8")

    async def send():
        response = await fetch(request.full_url, to_js(options, dict_converter=Object.fromEntries))
        return response.status, await response.text()

    try:
        status, body = run_sync(send())
    except JsException:
        raise URLError("Outbound HTTPS request failed") from None

    payload = BytesIO(body.encode("utf-8"))
    if not 200 <= status < 300:
        raise HTTPError(request.full_url, status, "Upstream HTTP error", None, payload)
    return payload
