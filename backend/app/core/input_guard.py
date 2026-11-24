"""Rechaza en la entrada datos que PostgreSQL o la respuesta JSON no pueden manejar.

PostgreSQL no acepta el byte NUL en columnas de texto y una mitad suelta de un par
sustituto (p. ej. "\\ud800") no se puede codificar en UTF-8. Si llegan a la base de
datos terminan en un error 500; aquí se responden como 422 antes de tocar la API.
"""

import json
from urllib.parse import unquote

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

MENSAJE = "El texto contiene caracteres no permitidos"


def texto_invalido(valor: str) -> bool:
    if "\x00" in valor:
        return True
    try:
        valor.encode("utf-8")
    except UnicodeEncodeError:
        return True
    return False


def _contiene_invalido(valor) -> bool:
    if isinstance(valor, str):
        return texto_invalido(valor)
    if isinstance(valor, dict):
        return any(_contiene_invalido(k) or _contiene_invalido(v) for k, v in valor.items())
    if isinstance(valor, list):
        return any(_contiene_invalido(v) for v in valor)
    return False


def _rechazar_constante(nombre):
    # NaN e Infinity no son JSON válido y no se pueden devolver en la respuesta.
    raise ValueError(nombre)


async def _responder_422(send):
    cuerpo = json.dumps({"detail": MENSAJE}, ensure_ascii=False).encode("utf-8")
    await send({"type": "http.response.start", "status": 422,
                "headers": [(b"content-type", b"application/json"),
                            (b"content-length", str(len(cuerpo)).encode())]})
    await send({"type": "http.response.body", "body": cuerpo})


class InputGuardMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        consulta = unquote(scope.get("query_string", b"").decode("latin-1"), errors="surrogateescape")
        ruta = unquote(scope.get("path", ""), errors="surrogateescape")
        if texto_invalido(ruta) or texto_invalido(consulta):
            return await _responder_422(send)

        mensajes = []
        cuerpo = b""
        while True:
            mensaje = await receive()
            mensajes.append(mensaje)
            if mensaje["type"] != "http.request":
                break
            cuerpo += mensaje.get("body", b"")
            if not mensaje.get("more_body", False):
                break

        if cuerpo.strip()[:1] in (b"{", b"["):
            try:
                datos = json.loads(cuerpo, parse_constant=_rechazar_constante)
            except ValueError:
                datos = None
                if b"NaN" in cuerpo or b"Infinity" in cuerpo:
                    return await _responder_422(send)
            if _contiene_invalido(datos):
                return await _responder_422(send)

        pendientes = iter(mensajes)

        async def reenviar():
            try:
                return next(pendientes)
            except StopIteration:
                return await receive()

        await self.app(scope, reenviar, send)


async def manejar_validacion(request: Request, error: RequestValidationError):
    # La respuesta por defecto repite el dato recibido; si no se puede serializar
    # (p. ej. NaN) FastAPI termina en 500. Solo se devuelve dónde y qué falló.
    errores = [{"loc": e.get("loc"), "msg": e.get("msg"), "type": e.get("type")} for e in error.errors()]
    return JSONResponse(status_code=422, content={"detail": jsonable_encoder(errores)})
