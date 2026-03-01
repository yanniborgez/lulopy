# LuloPy

Aplicación web estática para practicar Python (se ejecuta **en el navegador** con Pyodide).  
Incluye ruta guiada, práctica libre, misiones diarias y reto del día. El progreso se guarda en el navegador y puede exportarse.

## Ejecutar localmente
1) Abre una terminal en esta carpeta.
2) Ejecuta uno de estos:
   - Windows: `start_windows.bat`
   - macOS/Linux: `./start_mac_linux.sh`
3) Abre la URL que aparece (normalmente http://localhost:8000)

## Desplegar gratis en Vercel (plan Hobby, uso personal/no comercial)
1) Sube **este contenido** a un repositorio en GitHub.
2) En Vercel: New Project → Import Git Repository → Framework: Other → Deploy.
   - No necesitas build command.
3) Vercel publicará el sitio como estático (HTML/CSS/JS/JSON).

## Estructura
- `index.html`, `app.js`, `styles.css`: app
- `exercises.json`, `exams.json`: banco principal
- `daily_bank.json`: misiones diarias (100, código largo)
- `challenge_bank.json`: reto del día (100, código difícil, 1 intento/día)
- `practicas/`: prácticas en texto para resolver en IDE
