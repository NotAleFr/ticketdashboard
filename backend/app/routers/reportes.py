import csv
from io import StringIO
from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.database import get_db
from app.models.aulas import Aula
from app.models.tickets import EstadoTicket, Ticket
from app.models.usuarios import Usuario
from app.services.report_service import consulta_reporte, datos_fila, filas_reporte

router = APIRouter(prefix="/reportes", tags=["Reportes"])
Periodo = Literal["hoy", "ultima-semana", "ultimo-mes", "este-ano", "todos"]


@router.get("")
def obtener_reporte(
    estado: EstadoTicket | None = None,
    id_aula: int | None = Query(default=None, ge=1),
    periodo: Periodo = "ultimo-mes",
    pagina: int = Query(default=1, ge=1),
    por_pagina: int = Query(default=3, ge=1, le=100),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    query, anterior, labs = consulta_reporte(db, usuario, estado, id_aula, periodo)
    counts = dict(query.with_entities(Ticket.estado, func.count(Ticket.id_ticket))
                  .group_by(Ticket.estado).all())
    anteriores = None if anterior is None else dict(
        anterior.with_entities(Ticket.estado, func.count(Ticket.id_ticket)).group_by(Ticket.estado).all()
    )
    total = sum(counts.values())
    paginas = max(1, (total + por_pagina - 1) // por_pagina)
    pagina = min(pagina, paginas)
    por_lab = (query.join(Aula, Ticket.id_aula == Aula.id_aula)
               .with_entities(Aula.id_aula, Aula.nombre, func.count(Ticket.id_ticket))
               .group_by(Aula.id_aula, Aula.nombre).order_by(Aula.nombre).all())
    return {
        "total": total, "pagina": pagina, "por_pagina": por_pagina, "paginas": paginas,
        "estados": {estado.value: counts.get(estado.value, 0) for estado in EstadoTicket},
        "anteriores": anteriores,
        "laboratorios": [{"id_aula": lab.id_aula, "nombre": lab.nombre, "activo": lab.activo} for lab in labs],
        "por_laboratorio": [{"id_aula": id, "nombre": nombre, "total": count} for id, nombre, count in por_lab],
        "tickets": [datos_fila(fila) for fila in filas_reporte(query)
                    .offset((pagina - 1) * por_pagina).limit(por_pagina).all()],
    }


def celda_csv(valor):
    texto = "" if valor is None else str(valor)
    # Evita que títulos/nombres escritos por usuarios se ejecuten como fórmulas.
    if texto.lstrip().startswith(("=", "+", "-", "@")) or texto.startswith(("\t", "\r", "\n")):
        texto = "'" + texto
    return texto


@router.get("/exportar")
def exportar_reporte(
    estado: EstadoTicket | None = None,
    id_aula: int | None = Query(default=None, ge=1),
    periodo: Periodo = "ultimo-mes",
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    query, _, _ = consulta_reporte(db, usuario, estado, id_aula, periodo)

    def generar():
        buffer = StringIO()
        writer = csv.writer(buffer)
        yield "\ufeff"
        writer.writerow(["ID", "Título", "Aula", "Equipo", "Estado", "Fecha", "Responsable", "Reportante"])
        yield buffer.getvalue()
        for fila in filas_reporte(query).yield_per(200):
            datos = datos_fila(fila)
            buffer.seek(0)
            buffer.truncate(0)
            writer.writerow([celda_csv(datos[key]) for key in (
                "id_ticket", "nombre_ticket", "nombre_aula", "equipo", "estado",
                "fecha_registro", "nombre_tecnico", "nombre_reportante")])
            yield buffer.getvalue()

    return StreamingResponse(generar(), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": 'attachment; filename="reportes.csv"'})
