# SDR Server Android — servidor rtl_tcp multi-cliente

App Android que levanta un **servidor SDR (rtl_tcp)** en el teléfono, muestra **IP y puerto**, y acepta **múltiples conexiones** sin caerse cuando un cliente se desconecta.

## Qué hace

- Servicio en primer plano (sigue activo con la pantalla apagada)
- Muestra IP LAN + puerto en la UI y en la notificación
- Protocolo compatible con clientes rtl_tcp (SDR#, SDR++, GQRX, etc.)
- Un productor IQ alimenta a todos los clientes a la vez
- Errores/desconexiones de un cliente aislados: el servidor sigue

## Compilar el APK

```bash
cd sdr-server-android
./gradlew assembleDebug
```

APK generado:

```
app/build/outputs/apk/debug/app-debug.apk
```

## Uso

1. Instalá el APK en el Android (misma Wi‑Fi que los clientes).
2. Abrí **SDR Server** → ajustá puerto (default `1234`) → **Iniciar servidor**.
3. Anotá la IP:puerto (o usá **Copiar IP:puerto**).
4. En el cliente: fuente `rtl_tcp` / `RTL-SDR TCP` → esa IP y puerto.

## Nota sobre hardware

Esta build incluye un **generador IQ demo** (tono + ruido) para probar multi-cliente y estabilidad de red sin dongle USB. La arquitectura del servidor (acceptor + fan-out + aislamiento por cliente) es la base para enganchar un origen USB RTL-SDR real más adelante.
