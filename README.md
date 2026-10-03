# Beat Rush

Mini juego de ritmo para navegador: 5 niveles, un nivel secreto, mapa de progreso, 6 personajes y 6 escenarios originales. HTML5 + CSS3 + JavaScript vanilla, sin dependencias, sin servidor. Toda la música se sintetiza en vivo con Web Audio API y todos los gráficos son SVG/CSS generados en código.

## Estructura

```
index.html   Pantallas: bienvenida, historia, inicio, mapa, opciones, juego y resultados
style.css    Estilos mobile-first (mapa vertical en celular, horizontal en pantallas grandes)
script.js    Todo el juego, organizado en 10 secciones numeradas:
             1 datos de niveles y música · 2 construcción de canciones · 3 personajes y escenarios
             4 audio · 5 reloj compartido · 6 progreso · 7 pantallas · 7b historia · 8 juego
             9 resultados · 10 input
```

Para cambiar un nivel, edita su entrada en `LEVELS` (script.js, sección 1): cada compás es una lista de posiciones en pulsos, por ejemplo `[0, 1, 2, 2.5]`.

## Niveles

| Nivel | Escenario | Personaje | BPM | Lo nuevo |
|---|---|---|---|---|
| 1 Tutorial | Ciudad arcade nocturna | Bolt, el robot | 100 | Pulsos y primeros dobles |
| 2 Fácil | Bosque colorido | Miso, la gata | 108 | Ritmo saltarín 3-3-2 |
| 3 Intermedio | Espacio | Nova, la astronauta | 116 | Contratiempos y silencios largos |
| 4 Difícil | Ciudad futurista | Kage, el ninja | 124 | Tresillos |
| 5 Muy difícil | Escenario de concierto | Draco, el dragón DJ | 132 | Síncopas y semicorcheas |
| Secreto | Prisma / aurora | Lumi, el espíritu prisma | 120 → 150 → 96 → 140 | Cambios de tempo |

## Historia de introducción

La primera vez que alguien abre el juego aparece una pantalla de bienvenida con el botón EMPEZAR (los celulares exigen un toque antes de reproducir sonido). Después se reproduce una cinemática de unos 30 segundos, hecha con los mismos personajes SVG, el escenario arcade y música sintetizada a 120 BPM:

1. Beat City vive al ritmo y cinco esferas de colores bailan sobre Pum.
2. Llega el Gran Silencio, una nube con ojos que apaga la ciudad.
3. La nube se roba los cinco ritmos.
4. A Pum le queda una baqueta que todavía late.
5. Llegan sus amigos (los personajes de los cinco niveles) y la música vuelve.
6. Se insinúa el nivel secreto con la silueta de Lumi.
7. Aparece BEAT RUSH, los ritmos regresan y el botón ¡A JUGAR!

Se puede saltar con el botón "Saltar" o con ESC. Después de verla o saltarla, el juego abre directo en la pantalla principal. Para volver a verla: "Ver la historia" en la pantalla principal u Opciones → Historia → VER. Los textos y los tiempos están en `STORY_SCENES` y la música en `scheduleStoryMusic` (script.js, sección 7b).

## Reglas

- Cada nivel da una nota de 0 a 100: PERFECT vale 100 %, GOOD 90 %, MISS 0. Los toques fuera de ritmo también cuentan como fallo. Sacar 100 exige cero MISS y casi todo PERFECT.
- Con 50 o más se desbloquea el siguiente nivel (constante `PASS_SCORE`).
- Estrellas: 100 = ★★★★★, 90+ = 4, 75+ = 3, 60+ = 2, 50+ = 1.
- El nivel secreto aparece al tener 100 en los cinco niveles. Superarlo da la Corona Prisma en la pantalla de inicio.
- El progreso (niveles, mejor nota, precisión, combo y si ya viste la historia) se guarda en `localStorage`. Si el navegador no lo permite, el juego funciona igual durante la sesión.

## Probar todos los niveles

Para revisar o presentar sin jugar todo el camino, abre la página con `?desbloquear=todo` al final de la URL. Desbloquea todo sólo en esa visita y no modifica el progreso guardado.

## Publicar en GitHub Pages

1. Sube `index.html`, `style.css` y `script.js` a la raíz de un repositorio.
2. Settings → Pages → "Deploy from a branch", rama `main`, carpeta `/ (root)`.
3. En uno o dos minutos tendrás `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.
4. Genera un código QR de esa URL.

## Notas técnicas

- Música, indicadores y toques comparten un reloj: la música se agenda en el reloj del AudioContext y los toques se convierten a ese mismo tiempo, compensando la latencia que reporta el navegador. En Opciones hay un ajuste de sincronía para audífonos Bluetooth.
- Las ventanas de precisión se hacen un poco más estrictas en cada nivel (PERFECT de ±90 ms en el nivel 1 a ±70 ms en el 5).
- Las fuentes (Bungee y Fredoka) vienen de Google Fonts. Sin internet el juego usa fuentes del sistema.