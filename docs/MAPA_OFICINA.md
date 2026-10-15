# Mapa de la oficina Quiiven

El mapa se genera con `node scripts/gen-map.mjs` (desde la raíz del repo) y produce:

| Archivo | Qué contiene |
|---|---|
| `apps/web/public/maps/demo.tmj` | Pisos por área, muro exterior, muebles (capa `decor`), zonas y colisiones |
| `apps/web/public/walls.json` | Muros interiores como objetos editables por admin (83) |
| `apps/web/public/objects.json` | TV de la sala de juntas, pantalla del auditorio y pizarra de la sala creativa |

Inspirado en la plantilla *great-place-to-work* de WorkAdventure, adaptado a la gráfica Quiiven: cada área usa su color del manual de marca (Ventas amarillo, Marketing aguamarina, Tech azul, Personas naranja). Las áreas sin color oficial (Operaciones, Finanzas, Dirección) usan Carbón. Los espacios comunes usan el degradado multiárea.

## Distribución (100 × 60 casillas)

| Zona | Salas |
|---|---|
| Norte-oeste · Ventas | Equipo Jenn, Dirección Comercial, Equipo Bahamon, Equipo Juanfer, Equipo Juanes, Sala Ventas |
| Norte-centro | Auditorio Quiiven (80 sillas + espacio de pie, tarima y pantalla) |
| Norte-este · Marketing | COL Célula 1 Sara & Manu, COL Célula 2 Juli & Bri, COL+GT Célula 3 Cin & Andrew, GT+MX Célula 1 Vivi & Mari, GT+MX Célula 2 JuanDa & Carlos, GT+MX Célula 3 Camilo & MariWar |
| Centro-oeste | Tech, Operaciones |
| Centro | Jardín (fuente, estanque, árboles, bancas) |
| Centro-este | Restaurante, Pausa activa |
| Sur-oeste | Salas 1-4, Finanzas, Talento Humano, Oficina CEO |
| Sur-centro | Recepción (punto de llegada) |
| Sur-este | Sala de juntas, Sala creativa, Salas 5-6, 3 cabinas individuales |

## Puestos por equipo

Fuente: Airtable · Usuarios activos, Equipos Ventas y Equipos Marketing (octubre 2026), más Finanzas (4), Talento Humano (2) y CEO (1) indicados por el equipo. Cada sala tiene puestos para su gente y uno o dos de sobra.

| Sala | Personas | Escritorios |
|---|---|---|
| Ventas · Equipo Jenn | 6 | 8 |
| Ventas · Equipo Juanfer | 4 | 6 |
| Ventas · Equipo Juanes | 3 | 4 |
| Ventas · Equipo Bahamon | 2 | 4 |
| Dirección Comercial | 1 (Andrés Serna) | 2 |
| MKT COL · Célula 1 Sara & Manu | 4 | 6 |
| MKT COL · Célula 2 Juli & Bri | 4 | 6 |
| MKT COL+GT · Célula 3 Cin & Andrew | 2 | 4 |
| MKT GT+MX · Célula 1 Vivi & Mari | 2 | 4 |
| MKT GT+MX · Célula 2 JuanDa & Carlos | 3 | 4 |
| MKT GT+MX · Célula 3 Camilo & MariWar | 3 | 4 |
| Tech | 5 | 6 |
| Operaciones | 4 | 6 |
| Finanzas | 4 | 5 |
| Talento Humano | 2 | 3 |
| Oficina CEO | 1 | 1 |

En Airtable hay una persona activa de Diseño (Marketing) sin nombre ni célula; tiene puesto libre en las células de Marketing.

## Zonas y audio

- **Privadas** (solo se escuchan quienes están dentro): oficinas de equipo, salas de reuniones, cabinas, CEO y auditorio.
- **Abiertas** (proximidad normal): jardín, restaurante, pausa activa y recepción.
- El auditorio cabe toda la empresa, pero la voz hoy es malla P2P con tope de 5 conexiones. Para charlas con todos falta un modo "escenario" con SFU (Fase 3).

## Al desplegar

Los muros interiores son objetos en la base de datos y **solo se siembran cuando la tabla `objects` está vacía**. En un servidor que ya tiene los 18 muros del mapa anterior hay que vaciar `objects` (o borrar la base SQLite) antes de arrancar para que entren los muros y objetos nuevos.
