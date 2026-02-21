# NEXUS — Plataforma Educativa I.E. Sabaneta

Compañero de retos académicos para estudiantes de grados 7–11.
Prof. Fabio Alberto Ortiz M. · Tecnología e Informática

## Estructura del proyecto

```
nexus-sabaneta/
├── api/
│   └── chat.js          ← Backend seguro (API Key nunca llega al navegador)
├── src/
│   ├── main.jsx         ← Punto de entrada React
│   └── App.jsx          ← Toda la aplicación
├── index.html           ← HTML base
├── package.json         ← Dependencias
├── vite.config.js       ← Configuración Vite
└── README.md
```

## Despliegue en Vercel (paso a paso)

### 1. Sube a GitHub

1. Ve a github.com y crea un repositorio llamado `nexus-sabaneta`
2. Descarga GitHub Desktop o usa la web
3. Sube TODOS estos archivos manteniendo la estructura de carpetas

### 2. Conecta con Vercel

1. Ve a vercel.com e inicia sesión con tu cuenta de GitHub
2. Clic en **"New Project"**
3. Selecciona el repositorio `nexus-sabaneta`
4. Vercel detectará automáticamente que es un proyecto Vite/React
5. **IMPORTANTE — Variables de entorno:** Antes de hacer Deploy, agrega:
   - Nombre: `ANTHROPIC_API_KEY`
   - Valor: tu API key de console.anthropic.com
6. Clic en **Deploy**

En 2 minutos tendrás: `nexus-sabaneta.vercel.app`

### 3. Obtener la API Key de Anthropic

1. Ve a console.anthropic.com
2. Crea una cuenta gratuita
3. Ve a "API Keys" → "Create Key"
4. Copia la key (solo se muestra una vez)
5. Pégala en la variable de entorno de Vercel

## Seguridad

La API Key de Anthropic NUNCA llega al navegador del estudiante.
El archivo `api/chat.js` actúa como intermediario seguro (serverless function de Vercel).

## Cuentas de prueba

| Rol          | Correo                                 | Contraseña |
|--------------|----------------------------------------|------------|
| Admin        | fabioortiz37422@sabaneta.edu.co        | admin123   |
| Docente      | docente@sabaneta.edu.co               | docente123 |
| Estudiante   | estudiante1@sabaneta.edu.co           | est123     |

## Para conectar Supabase (opcional)

1. Crea cuenta en supabase.com
2. Nuevo proyecto → copia URL y anon key
3. En App.jsx líneas 5-6, reemplaza los valores
4. Exporta tu SQLite como CSV e impórtalo en Supabase
