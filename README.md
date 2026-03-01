# LuloPy

LuloPy es una aplicación web estática para practicar Python con ejercicios verificables en el navegador (Pyodide).
Incluye ruta guiada, práctica libre por capítulo, misiones diarias y un reto del día.

## Contenido
- **Entrenamiento:** 240 ejercicios (4 capítulos × 60; 36 código / 12 fill / 12 opción múltiple por capítulo)
- **Exámenes:** 75 incisos (3 exámenes × 25; un intento por inciso)
- **Misiones diarias:** 100 ejercicios de código (más largos)
- **Reto del día:** 100 ejercicios avanzados (1 intento por día)

## Uso local
1) Abrir una terminal en esta carpeta.
2) Ejecutar:
   - Windows: `start_windows.bat`
   - macOS/Linux: `./start_mac_linux.sh`
3) Abrir la URL indicada (normalmente `http://localhost:8000`).

## Despliegue en Vercel (estático)
1) Subir el contenido de este repositorio a GitHub.
2) En Vercel: **New Project → Import** el repositorio.
3) Configuración recomendada:
   - **Framework:** Other
   - **Root Directory:** `./`
   - **Build Command:** (vacío)
   - **Output Directory:** (vacío)
4) Deploy.

## Estructura
- `index.html`, `app.js`, `styles.css`: aplicación
- `exercises.json`, `exams.json`: banco principal
- `daily_bank.json`: misiones diarias (100)
- `challenge_bank.json`: reto del día (100)
- `practicas/`: prácticas para resolver en IDE
