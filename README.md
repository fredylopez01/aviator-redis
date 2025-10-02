# 🎮🎲 Replicación y Alta Disponibilidad en un Juego de Apuestas en Tiempo Real

## 📌 Introducción

Este proyecto consiste en el diseño e implementación de una aplicación distribuida que simula una **sala de apuestas en tiempo real**, inspirada en el juego _Aviator_.
El objetivo principal es garantizar la **alta disponibilidad** y la **consistencia de los datos** mediante un **clúster de bases de datos replicado** y un sistema tolerante a fallos en el backend.

La aplicación permite que, aunque un nodo de la base de datos o del backend falle, el sistema siga operativo mediante **failover automático** y **reconexiones transparentes** para el usuario.

## ⚙️ Tecnologías

- **Backend:** Node.js
- **Frontend:** React + TypeScript
- **Base de datos:** MongoDB replicado (3 nodos – Maestro/Esclavos)
- **Comunicación en tiempo real:** WebSockets
- **Balanceo de carga:** Nginx
- **Gestión de estado distribuido:** Redis (Pub/Sub)
- **Contenedores y despliegue:** Docker & Docker Compose

## 🎯 Objetivos del Laboratorio

1. **Arquitectura Distribuida**

   - Diseño de un sistema con nodos de backend, frontend y base de datos replicada.

2. **Replicación y Failover de Base de Datos**

   - Configurar replicación Maestro–Esclavo en MongoDB.
   - Promoción automática de un esclavo cuando el maestro cae.

3. **Backend (API de Apuestas)**

   - Gestión de lógica del juego.
   - Escrituras → Maestro | Lecturas → Esclavos.

4. **Frontend (Sala en Tiempo Real)**

   - Interfaz de usuario donde los jugadores realizan apuestas.
   - Comunicación en tiempo real con WebSockets.

5. **Alta Disponibilidad del Backend**

   - Balanceo de carga con Nginx.
   - Redis Pub/Sub para compartir estado entre nodos.
   - Reconexión automática de WebSockets en el cliente.

## 📋 Arquitectura

```
                        ┌─────────────────────┐
                        │     Cliente Web     │
                        │  React + TypeScript │
                        └─────────┬───────────┘
                                  │
                                  ▼
                        ┌─────────────────────┐
                        │  Nginx Load Balancer│
                        └─────────┬───────────┘
                   ┌──────────────┴──────────────┐
                   ▼                             ▼
        ┌───────────────────┐            ┌───────────────────┐
        │   Backend Node.js │            │   Backend Node.js │
        │   Express + WS    │◀──Redis──▶|   Express + WS    │
        └─────────┬─────────┘            └─────────┬─────────┘
                  |────────────────────────────────┘
                  |
                  ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
|  ┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐    |
|  │   MongoDB (Master)  │───|   MongoDB (Slave)   │───│   MongoDB (Slave)   │    |
|  └─────────────────────┘   └─────────────────────┘   └─────────────────────┘    |
└─────────────────────────────────────────────────────────────────────────────────┘


```

### Componentes:

- **NGINX**: Balanceador de carga para distribuir conexiones WebSocket
- **Backend 1 y 2**: Instancias Node.js con Socket.IO
- **Redis**: Estado compartido y Pub/Sub para sincronización
- **MongoDB Replica Set**: 3 nodos para alta disponibilidad de datos

---

## 🚀 Despliegue Rápido

### Prerrequisitos

- Docker y Docker Compose instalados
- Puertos libres: 80, 3001, 3002, 6379, 27017-27019

### Paso 1: Clonar repositorio

### Paso 2: Iniciar servicios con Docker Compose

```bash
docker-compose up --build -d
```

Esto levantará:

- 3 nodos MongoDB (replica set)
- 1 nodo Redis
- 2 backends Node.js
- 1 NGINX como load balancer

### Paso 3: Inicializar Replica Set de MongoDB

Esperar 10 segundos y luego ejecutar:

```bash
docker exec -it aviator-mongo1 mongosh --eval "
rs.initiate({
  _id: 'aviator-rs',
  members: [
    { _id: 0, host: 'aviator-mongo1:27017', priority: 3 },
    { _id: 1, host: 'aviator-mongo2:27017', priority: 2 },
    { _id: 2, host: 'aviator-mongo3:27017', priority: 1 }
  ]
})
"
```

Verificar el estado del replica set:

```bash
docker exec -it aviator-mongo1 mongosh --eval "rs.status()"
```

Deberías ver un nodo PRIMARY y dos SECONDARY.

### Paso 4: Verificar logs

```bash
# Ver logs de los backends
docker-compose logs -f backend1 backend2

# Deberías ver:
# [backend1] 👑 SOY EL LÍDER
# [backend2] 📡 Modo seguidor
```

### Paso 5: Acceder al frontend

Abre el frontend en el navegador, para esto tines que ir a frontend y hacer `npm i` y luego `npm run dev`

---

## 🧪 Pruebas de Alta Disponibilidad

### Prueba 1: Failover del Backend

1. Abre varios navegadores y conecta múltiples usuarios
2. Verifica que todos vean las apuestas en tiempo real
3. Detén el backend líder:

```bash
docker stop aviator-backend1
```

4. **Resultado esperado**:

   - Los clientes conectados a backend1 se desconectan momentáneamente
   - El frontend reconecta automáticamente a través de NGINX
   - Backend2 se convierte en líder automáticamente
   - El juego continúa sin pérdida de datos

5. Verificar logs de backend2:

```bash
docker logs aviator-backend2
# Deberías ver: [backend2] 👑 SOY EL LÍDER
```

6. Reiniciar backend1:

```bash
docker start aviator-backend1
```

### Prueba 2: Failover de MongoDB

1. Con el juego funcionando, verificar el nodo PRIMARY:

```bash
docker exec -it aviator-mongo1 mongosh --eval "rs.status()" | grep -A 2 PRIMARY
```

2. Detener el nodo PRIMARY (asumiendo que es mongo1):

```bash
docker stop aviator-mongo1
```

3. **Resultado esperado**:

   - MongoDB automáticamente elige un nuevo PRIMARY
   - Los backends reconectan automáticamente
   - El juego continúa sin interrupciones

4. Verificar nueva configuración:

```bash
docker exec -it aviator-mongo2 mongosh --eval "rs.status()"
```

5. Reiniciar mongo1:

```bash
docker start aviator-mongo1
```

---

## 📊 Monitoreo

### Ver estado de Redis

```bash
docker exec -it aviator-redis redis-cli

# Comandos útiles:
KEYS *                    # Ver todas las claves
GET game:leader           # Ver quién es el líder
GET game:round:current    # Ver ronda actual
KEYS player:*             # Ver jugadores conectados
```

### Ver estado de MongoDB

```bash
docker exec -it aviator-mongo1 mongosh

use aviator
db.users.find()           // Ver usuarios
db.gamerounds.find().sort({roundNumber:-1}).limit(5)  // Últimas 5 rondas
```

### Ver logs en tiempo real

```bash
# Todos los servicios
docker-compose logs -f

# Solo backends
docker-compose logs -f backend1 backend2

# Solo MongoDB
docker-compose logs -f mongo1 mongo2 mongo3
```

---

## 🛑 Detener el sistema

```bash
# Detener todos los servicios
docker-compose down

# Detener y eliminar volúmenes (⚠️ borra todos los datos)
docker-compose down -v
```

---

## 🐛 Troubleshooting

### Backend no se conecta a MongoDB

```bash
# Verificar que el replica set esté configurado
docker exec -it aviator-mongo1 mongosh --eval "rs.status()"

# Reinicializar si es necesario
docker exec -it aviator-mongo1 mongosh --eval "rs.reconfig(...)"
```

### Redis no responde

```bash
# Verificar estado
docker exec -it aviator-redis redis-cli ping

# Debería responder: PONG
```

### WebSocket no conecta

```bash
# Verificar que NGINX esté corriendo
docker ps | grep nginx

# Ver logs de NGINX
docker logs aviator-nginx

# Verificar configuración
docker exec -it aviator-nginx cat /etc/nginx/nginx.conf
```

### Frontend no sincroniza

1. Abrir consola del navegador (F12)
2. Verificar mensajes de Socket.IO
3. Verificar que `SERVER_URL` en `frontend/src/socket.tsx` apunte correctamente:

```typescript
const SERVER_URL = "http://localhost"; // Cambiar si es necesario
```

---

## 📝 Arquitectura Técnica

### Flujo de una Ronda

1. **Backend Líder** crea nueva ronda:

   - Genera `crashPoint` aleatorio
   - Calcula `startTime = now + 10000ms` (10 segundos para apostar)
   - Calcula `crashTime = startTime + duration`
   - Guarda en Redis: `game:round:current`
   - Publica evento: `game:round:new`

2. **Todos los Backends** reciben evento y notifican a sus clientes conectados

3. **Frontends** esperan hasta `startTime` y comienzan a incrementar multiplicador localmente

4. **Backend Líder** verifica cada 500ms si es hora de crashear

5. Cuando `now >= crashTime`:
   - Líder publica evento: `game:round:crash`
   - Todos los backends notifican a sus clientes
   - Se espera 3 segundos y se crea nueva ronda

### Sincronización de Estado

- **Redis**: Estado volátil (jugadores, ronda actual)
- **MongoDB**: Persistencia (usuarios, historial de rondas)
- **Pub/Sub**: Comunicación entre backends

### Liderazgo

- El líder mantiene un lock en Redis: `game:leader` con TTL de 5s
- Renueva el lock cada 3s
- Si falla, otro backend toma el liderazgo automáticamente

---

## 👥 Contribuciones

Para agregar nuevas funcionalidades:

1. Fork el repositorio
2. Crear feature branch: `git checkout -b feature/nueva-funcionalidad`
3. Commit cambios: `git commit -am 'Agrega nueva funcionalidad'`
4. Push a la rama: `git push origin feature/nueva-funcionalidad`
5. Crear Pull Request

---

## 📄 Licencia

Este proyecto es para fines educativos del laboratorio de Sistemas Distribuidos.
