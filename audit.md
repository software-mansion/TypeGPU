# TypeGPU — 75 znalezisk i testy regresji

Weryfikacja z 28 września 2026 na bieżącym w chwili startu `main`: `fd684ace348d13027021923f7111f911be746e49`. Branch roboczy: **`research/audit`**, checkout: [TypeGPU](/Users/michal/.codex/worktrees/003b/TypeGPU).

**75/75 wpisów ma test. Dodano 89 testów w 12 plikach: 83 FAIL i 6 PASS. Po zgrupowaniu według numerów: 70 usterek nadal odtwarzanych, 5 już obsłużonych na main — B01, B02, B16, B23, B28.**

Wspólne uruchomienie ośmiu pakietów: **2875 istniejących testów PASS, 2 istniejące SKIP, 0 błędów poza nowymi regresjami**. Nowe testy nie zawierają `skip`, `todo` ani `it.fails`; sprawdzają poprawne zachowanie. Zmieniono wyłącznie testy, bez napraw implementacji.

Testy obejmują wykonanie CPU i CLI, React, rzeczywisty generator Three, wygenerowany WGSL/GLSL i mocki API WebGPU/WebGL. **Nie uruchamiano shaderów na prawdziwym GPU.** Typecheck nowych testów oraz lint i formatowanie przechodzą.

[Pełne wyniki i komunikaty asercji (JSON)](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/testing-current/RESULTS-75.json) · [Log wspólnego uruchomienia](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/testing-current/all-packages-vitest.log) · [Wynik lint/format](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/testing-current/all-style.log)

## Uruchomienie

Z katalogu repozytorium; exit code 1 jest oczekiwany, dopóki istnieją czerwone regresje:

```sh
pnpm exec vitest run audit- --project='!browser'
```

Pojedynczy wpis, np. B20:

```sh
pnpm exec vitest run audit- --project='!browser' -t 'B20'
```

## Lista z aktualnym statusem

| ID | Priorytet | Wynik | Problem | Test |
| --- | --- | --- | --- | --- |
| [B01](#b01) | P2 | PASS | texture.write ignoruje byteOffset wejściowego widoku | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:22) |
| [B02](#b02) | P2 | PASS | Mipy tekstury 2D-array zmniejszają liczbę warstw | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:34), [2](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:44) |
| [B03](#b03) | P2 | FAIL | Warianty guarded pipeline mają niespójne bounds | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:54) |
| [B04](#b04) | P2 | FAIL | Trzy indeksy u16 tworzą nieprawidłowy bufor/upload 6 B | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:72), [2](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:83) |
| [B05](#b05) | P2 | FAIL | root.destroy nie niszczy własnych zasobów dla initFromDevice | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:98) |
| [B06](#b06) | P2 | FAIL | Jawne location fragment output nie wyznacza indeksu targetu | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:112) |
| [B07](#b07) | P2 | FAIL | Upload tekstur blokowo kompresowanych liczy bajty na teksel | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:136) |
| [B08](#b08) | P2 | FAIL | Automatyczny storage view obejmuje wiele mipów | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:147) |
| [B09](#b09) | P2 | FAIL | Domyślny sampled view r32float wymaga niewłączonego feature | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:166) |
| [B10](#b10) | P2 | FAIL | Three uniformArray nie odpowiada fizycznemu layoutowi TSL | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-three/tests/audit-runtime-regressions.test.ts:15), [2](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-three/tests/audit-runtime-regressions.test.ts:20), [3](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-three/tests/audit-runtime-regressions.test.ts:25) |
| [B11](#b11) | P2 | FAIL | Hook bufora niszczy zasób nadal widocznego UI w React | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-react/tests/audit-runtime-regressions.test.tsx:8) |
| [B12](#b12) | P2 | FAIL | writeSoA myli alignment pola macierzy ze stride kolumn | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:14) |
| [B13](#b13) | P2 | FAIL | patch disarray używa stride tablicy WGSL | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:23) |
| [B14](#b14) | P2 | FAIL | memoryLayoutOf zawyża contiguous, czasem poza alokację | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:30) |
| [B15](#b15) | P2 | FAIL | unorm10-10-10-2 ma odwróconą kolejność kanałów | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:40) |
| [B16](#b16) | P2 | PASS | pack4x8unorm pomija clamp i zaokrąglenie | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:49) |
| [B17](#b17) | P2 | FAIL | Kopiowanie mat3x3 przez std.copy/struct/array rzuca wyjątek | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:54) |
| [B18](#b18) | P2 | FAIL | Mnożenie integer vectors traci dolne bity | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:63) |
| [B19](#b19) | P2 | FAIL | Integer dot nie konwertuje wyniku do 32 bitów | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:67) |
| [B20](#b20) | P2 | FAIL | isCloseTo powiela ewaluację argumentu w shaderze | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:71), [2](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:97) |
| [B21](#b21) | P2 | FAIL | Writer bez eval gubi padding mat3x3 z płaskiej tablicy | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-noeval-regressions.test.ts:11) |
| [B22](#b22) | P2 | FAIL | Writer bez eval ignoruje endOffset | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-noeval-regressions.test.ts:17) |
| [B23](#b23) | P3 | PASS | deepEqual uznaje różne schematy tekstur za równe | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:102) |
| [B24](#b24) | P2 | FAIL | Transformacja compound assignment podwaja ewaluację LHS | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-compiler-regressions.test.ts:6) |
| [B25](#b25) | P2 | FAIL | for-of wybiera iterable ponownie w każdej iteracji | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-compiler-regressions.test.ts:21) |
| [B26](#b26) | P2 | FAIL | Cache shellless utożsamia tekstury f32 i i32 | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-compiler-regressions.test.ts:63) |
| [B27](#b27) | P2 | FAIL | Obiekty struct zmieniają kolejność lub usuwają efekty uboczne | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-compiler-regressions.test.ts:84), [2](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-compiler-regressions.test.ts:109) |
| [B28](#b28) | P2 | PASS | Accessor f32 z callbackiem emitującym 1 generuje i32 | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-compiler-regressions.test.ts:139) |
| [B29](#b29) | P2 | FAIL | Wspólne lowering emituje składnię WGSL do GLSL | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-gl/tests/audit-compiler-regressions.test.ts:7), [2](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-gl/tests/audit-compiler-regressions.test.ts:20) |
| [B30](#b30) | P2 | FAIL | GLSL alias wykonuje comptime trzy razy | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-gl/tests/audit-compiler-regressions.test.ts:32) |
| [B31](#b31) | P2 | FAIL | Entry point nie obsługuje wszystkich poprawnych form outputu | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-gl/tests/audit-compiler-regressions.test.ts:47), [2](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-gl/tests/audit-compiler-regressions.test.ts:56) |
| [B32](#b32) | P2 | FAIL | GLSL gubi atrybuty stage IO | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-gl/tests/audit-compiler-regressions.test.ts:67), [2](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-gl/tests/audit-compiler-regressions.test.ts:81) |
| [B33](#b33) | P2 | FAIL | Sygnatury funkcji GLSL tracą rozmiary tablic | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-gl/tests/audit-compiler-regressions.test.ts:96), [2](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-gl/tests/audit-compiler-regressions.test.ts:112) |
| [B34](#b34) | P2 | FAIL | Skalarne std.select staje się leniwe w GLSL | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-gl/tests/audit-compiler-regressions.test.ts:127) |
| [B35](#b35) | P3 | FAIL | Pusty helper GLSL emituje niekompletną deklarację | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-gl/tests/audit-compiler-regressions.test.ts:154) |
| [B36](#b36) | P2 | FAIL | Cache Perlin po resize niszczy bufor przy każdym odczycie | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-companion-regressions.test.ts:16) |
| [B37](#b37) | P2 | FAIL | Achromatyczne kolory Oklab prowadzą do NaN | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-companion-regressions.test.ts:37) |
| [B38](#b38) | P2 | FAIL | CLI tworzy absolutną ścieżkę pod cwd | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-cli/tests/audit-regressions.test.ts:9) |
| [B39](#b39) | P2 | FAIL | Setup WebGPU nadpisuje odziedziczone compilerOptions.types | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-cli/tests/audit-regressions.test.ts:25) |
| [B40](#b40) | P2 | FAIL | tgpu-gen emituje d.undefined dla standardowych typów | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/tgpu-gen/tests/audit-regressions.test.ts:26) |
| [B41](#b41) | P2 | FAIL | tgpu-gen pomija zależności w zagnieżdżonych tablicach | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/tgpu-gen/tests/audit-regressions.test.ts:37) |
| [B42](#b42) | P2 | FAIL | Alias runtime array generuje wolne arrayLength | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/tgpu-gen/tests/audit-regressions.test.ts:46) |
| [B43](#b43) | P2 | FAIL | Funkcje w jednej linii mają sklejone ciała w tgpu-gen | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/tgpu-gen/tests/audit-regressions.test.ts:52) |
| [B44](#b44) | P2 | FAIL | tgpu-gen nie escapuje WGSL w template literal | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/tgpu-gen/tests/audit-regressions.test.ts:62) |
| [B45](#b45) | P2 | FAIL | Wygenerowane funkcje nie mają podłączonych helperów | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/tgpu-gen/tests/audit-regressions.test.ts:66) |
| [B46](#b46) | P2 | FAIL | pnpm changes pomija co drugi zmieniony pakiet | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/tgpu-dev-cli/tests/audit-regressions.test.ts:7) |
| [B47](#b47) | P2 | FAIL | circleVertexCount akceptuje poziom, którego circle nie obsługuje | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-companion-regressions.test.ts:46) |
| [B48](#b48) | P3 | FAIL | Sampler powierzchni półkuli może zwrócić zerowy wektor | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-companion-regressions.test.ts:53) |
| [B49](#b49) | P3 | FAIL | Bernoulli(0) może zwrócić1 | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-companion-regressions.test.ts:62) |
| [B50](#b50) | P3 | FAIL | Parser hex akceptuje częściowo błędne napisy | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-companion-regressions.test.ts:67) |
| [B51](#b51) | P2 | FAIL | Typed withIndexBuffer ignoruje sizeElements | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:185) |
| [B52](#b52) | P2 | FAIL | Dekorowany schemat indeksów daje undefined indexFormat | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:199) |
| [B53](#b53) | P3 | FAIL | Inicjalizacja skalarnego f32 zmienia -0 w +0 | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:213) |
| [B54](#b54) | P2 | FAIL | unwrap(vertexLayout) odrzuca poprawne zagnieżdżone atrybuty | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:253) |
| [B55](#b55) | P2 | FAIL | Luka przed bind group o jawnym indeksie blokuje dispatch | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:273) |
| [B56](#b56) | P2 | FAIL | Three instancedArray z mat4 alokuje za mało danych | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-three/tests/audit-runtime-regressions.test.ts:46) |
| [B57](#b57) | P2 | FAIL | React 19.2 rekonfiguruje canvas przy niezwiązanym rerender | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-react/tests/audit-runtime-regressions.test.tsx:47) |
| [B58](#b58) | P2 | FAIL | Dekorowane pola struct nie są kopiowane ani domyślnie inicjalizowane | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:120) |
| [B59](#b59) | P2 | FAIL | Odczyt struct zagnieżdżonego w unstruct ignoruje packed offset | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-noeval-regressions.test.ts:24), [2](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:129) |
| [B60](#b60) | P2 | FAIL | Helpery macierzy powielają wywołanie argumentu w WGSL | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:139), [2](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:164) |
| [B61](#b61) | P2 | FAIL | Reader SNORM zwraca wartości poniżej -1 dla legalnej reprezentacji minimum | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:189) |
| [B62](#b62) | P3 | FAIL | Fallback writer daje inne zaokrąglenie unorm16 i BGRA niż compiled writer | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-noeval-regressions.test.ts:31) |
| [B63](#b63) | P3 | FAIL | Obliczenie rozmiaru schematu może przepełnić signed int32 | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:198) |
| [B64](#b64) | P2 | FAIL | Odczyt elementu lub length tablicy usuwa efekty uboczne | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-compiler-regressions.test.ts:171), [2](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-compiler-regressions.test.ts:196) |
| [B65](#b65) | P2 | FAIL | Konwersja array<f32> do array<i32> pomija konwersję elementów | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-compiler-regressions.test.ts:219) |
| [B66](#b66) | P2 | FAIL | Pipeline gubi uzgodnione lokacje varyings | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-compiler-regressions.test.ts:237) |
| [B67](#b67) | P2 | FAIL | Unplugin zmienia mutowalną deklarację funkcji JavaScript w const | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/unplugin-typegpu/test/audit-compiler-regressions.test.ts:8) |
| [B68](#b68) | P2 | FAIL | Ujemny return oczekiwanego u32 generuje nielegalne -1u | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-compiler-regressions.test.ts:257) |
| [B69](#b69) | P2 | FAIL | GLSL textureLoad dwukrotnie wykonuje producenta współrzędnych | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-gl/tests/audit-compiler-regressions.test.ts:162) |
| [B70](#b70) | P2 | FAIL | tgpu-gen nadpisuje inny plik dla output path zawierającego # | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/tgpu-gen/tests/audit-regressions.test.ts:73) |
| [B71](#b71) | P2 | FAIL | tgpu-gen scala różne outputy przez nieescapowane znaki globu | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/tgpu-gen/tests/audit-regressions.test.ts:91) |
| [B72](#b72) | P2 | FAIL | Legalne nazwy WGSL kolidują z deklaracjami generatora | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/tgpu-gen/tests/audit-regressions.test.ts:115) |
| [B73](#b73) | P2 | FAIL | XOROSHIRO może utknąć w permanentnym stanie zerowym | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-companion-regressions.test.ts:72) |
| [B74](#b74) | P2 | FAIL | sdBezier zwraca znaczną odległość dla punktu leżącego na małej krzywej | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-companion-regressions.test.ts:82) |
| [B75](#b75) | P2 | FAIL | Prosta łamana z dodatnimi promieniami rzuca NaN na CPU | [1](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-companion-regressions.test.ts:93) |

## Znaczenie historycznego audytu

Pierwotne 75 grup usterek (67 × P2, 8 × P3) pochodzi z audytu `e94c367b9117eb561889a8f91f32f0ab4c5d2db9` z 24 września 2026. Poniżej zachowano ich opisy; aktualny wynik jest osobno przy każdym wpisie. Lista nie zawiera martwego kodu, docsów ani przykładów.

<a id="b01"></a>
## B01 — texture.write ignoruje byteOffset wejściowego widoku (P2)

**Obecnie: PASS.** PASS: texture.write forwards the selected TypedArray view; uploaded bytes are [1,2,3,4].

**Dowód z pierwotnego audytu:** Dla backing `[91,92,93,94,1,2,3,4]` i `subarray(4)` do uploadu trafiają `[91,92,93,94]`, zamiast `[1,2,3,4]`. Kod podaje samo `.buffer`, gubiąc offset TypedArray/DataView.

**Metoda historycznej weryfikacji:** wykonanie; przechwycone argumenty WebGPU.

**Kod w chwili audytu:** [packages/typegpu/src/core/texture/texture.ts:560](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/core/texture/texture.ts#L560).

**Testy na obecnym main:**

- **PASSED** [B01 uploads only the supplied TypedArray subarray](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:22)

<a id="b02"></a>
## B02 — Mipy tekstury 2D-array zmniejszają liczbę warstw (P2)

**Obecnie: PASS.** PASS: both write and clear preserve all four 2D array layers at mip level one.

**Dowód z pierwotnego audytu:** Tekstura 4×4×4, mip1: poprawny upload 2×2×4×4 = 64 B zostaje odrzucony, ponieważ kod oczekuje 32 B. `clear(1)` także obejmuje tylko 2 z 4 warstw. Zmniejszanie głębokości jest poprawne dla 3D, a nie dla warstw 2D.

**Metoda historycznej weryfikacji:** wykonanie; descriptor + specyfikacja; pozytywna kontrola 3D.

**Kod w chwili audytu:** [packages/typegpu/src/core/texture/texture.ts:537](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/core/texture/texture.ts#L537).

**Testy na obecnym main:**

- **PASSED** [B02 writes every 2D array layer at a nonzero mip level](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:34)
- **PASSED** [B02 clears every 2D array layer at a nonzero mip level](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:44)

<a id="b03"></a>
## B03 — Warianty guarded pipeline mają niespójne bounds (P2)

**Obecnie: FAIL.** Last guarded size upload remains (10,1,1) when the original variant dispatches (100,1,1).

**Dowód z pierwotnego audytu:** `P.dispatchThreads(100); P.with(bg).dispatchThreads(10); P.dispatchThreads(100)` zapisuje współdzielony uniform tylko jako 100→10. Ostatni dispatch nadal ma bounds10, bo P ufa swojemu osobnemu cache. Pomija wątki 10..99.

**Metoda historycznej weryfikacji:** wykonanie pełnej ścieżki dispatch; spy wspólnego uniformu, GPU mock.

**Kod w chwili audytu:** [packages/typegpu/src/core/root/init.ts:185](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/core/root/init.ts#L185).

**Testy na obecnym main:**

- **FAILED** [B03 restores guarded dispatch bounds after a differently sized variant](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:54)

<a id="b04"></a>
## B04 — Trzy indeksy u16 tworzą nieprawidłowy bufor/upload 6 B (P2)

**Obecnie: FAIL.** Odd-length u16 arrays create a six-byte mapped buffer and upload six bytes, violating four-byte alignment.

**Dowód z pierwotnego audytu:** `createBuffer(arrayOf(u16,3),[0,1,2]).$usage("index")` emituje mappedAtCreation size6; oddzielne `write` emituje zapis 6 B. Oba wymagają wyrównania rozmiaru do 4 B. Zwyczajny indeksowany trójkąt trafia w błąd walidacji.

**Metoda historycznej weryfikacji:** wykonanie; argumenty createBuffer/writeBuffer + specyfikacja.

**Kod w chwili audytu:** [packages/typegpu/src/core/buffer/buffer.ts:267](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/core/buffer/buffer.ts#L267).

**Testy na obecnym main:**

- **FAILED** [B04 aligns an initialized odd-length u16 index buffer for mapping](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:72)
- **FAILED** [B04 uploads odd-length u16 indices with a four-byte-aligned write size](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:83)

<a id="b05"></a>
## B05 — root.destroy nie niszczy własnych zasobów dla initFromDevice (P2)

**Obecnie: FAIL.** Destroying a root with a borrowed device does not call destroy on its own materialized buffer or texture.

**Dowód z pierwotnego audytu:** Po stworzeniu i materializacji buffer+texture przez `initFromDevice`, `root.destroy()` nie wywołuje destroy żadnego z nich. Kontrakt w `rootTypes.ts:716` obiecuje sprzątanie zasobów roota także przy pożyczonym device. Nie jest to twierdzenie, że GC nigdy ich nie zwolni.

**Metoda historycznej weryfikacji:** wykonanie; licznik destroy + jawny kontrakt API.

**Kod w chwili audytu:** [packages/typegpu/src/core/root/init.ts:466](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/core/root/init.ts#L466).

**Testy na obecnym main:**

- **FAILED** [B05 destroys root-owned resources while retaining a borrowed device](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:98)

<a id="b06"></a>
## B06 — Jawne location fragment output nie wyznacza indeksu targetu (P2)

**Obecnie: FAIL.** The pipeline descriptor places location-one output at target zero instead of preserving a null target-zero slot.

**Dowód z pierwotnego audytu:** Shader z jednym outputem `location(1,vec4f)` jest poprawnie generowany pod location1, ale targets ląduje pod indeksem0 zamiast `[null,target]`. Analogicznie attachments są układane według kolejności pól.

**Metoda historycznej weryfikacji:** wykonanie descriptoru pipeline; attachments sprawdzone źródłowo; niezależny cross-review.

**Kod w chwili audytu:** [packages/typegpu/src/core/pipeline/connectTargetsToShader.ts:26](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/core/pipeline/connectTargetsToShader.ts#L26).

**Testy na obecnym main:**

- **FAILED** [B06 places a fragment target at its explicitly declared output location](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:112)

<a id="b07"></a>
## B07 — Upload tekstur blokowo kompresowanych liczy bajty na teksel (P2)

**Obecnie: FAIL.** One valid eight-byte BC1 block is rejected because the calculated size is 128 bytes.

**Dowód z pierwotnego audytu:** BC1 4×4 z włączonym feature wymaga 8 B. `write(Uint8Array(8))` rzuca „Expected 128 bytes”. Błędne są również bytesPerRow/rowsPerImage: kod traktuje rozmiar bloku jak rozmiar jednego teksela.

**Metoda historycznej weryfikacji:** wykonanie; argumenty + tabela formatów WebGPU.

**Kod w chwili audytu:** [packages/typegpu/src/core/texture/texture.ts:546](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/core/texture/texture.ts#L546).

**Testy na obecnym main:**

- **FAILED** [B07 uploads a 4x4 BC1 texture as one eight-byte compression block](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:136)

<a id="b08"></a>
## B08 — Automatyczny storage view obejmuje wiele mipów (P2)

**Obecnie: FAIL.** The default storage view inherits all three mips instead of selecting one.

**Dowód z pierwotnego audytu:** Przekazanie tekstury mającej 3 mipy bezpośrednio do bindingu storage tworzy view bez `mipLevelCount:1`. Domyślnie obejmuje wszystkie 3; binding storage dopuszcza dokładnie 1. Ręczne createView z limitem działa jako obejście.

**Metoda historycznej weryfikacji:** wykonanie; descriptor + specyfikacja; niezależny cross-review.

**Kod w chwili audytu:** [packages/typegpu/src/core/texture/texture.ts:667](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/core/texture/texture.ts#L667).

**Testy na obecnym main:**

- **FAILED** [B08 defaults a storage binding view to exactly one mip level](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:147)

<a id="b09"></a>
## B09 — Domyślny sampled view r32float wymaga niewłączonego feature (P2)

**Obecnie: FAIL.** The r32float view generates sampleType float without the optional float32-filterable feature.

**Dowód z pierwotnego audytu:** Dla r32float bez `float32-filterable`, no-arg `createView()` generuje BGL sampleType `float`; potrzebne jest `unfilterable-float`. Dotyczy także rg32float/rgba32float. Repro używa textureLoad, więc błąd nie wynika z żądania filtrowania.

**Metoda historycznej weryfikacji:** wykonanie; BGL + aktualna specyfikacja; niezależny cross-review.

**Kod w chwili audytu:** [packages/typegpu/src/core/texture/texture.ts:738](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/core/texture/texture.ts#L738).

**Testy na obecnym main:**

- **FAILED** [B09 binds an r32float default view without requiring float32-filterable](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:166)

<a id="b10"></a>
## B10 — Three uniformArray nie odpowiada fizycznemu layoutowi TSL (P2)

**Obecnie: FAIL.** Declared u32/i32 uniform arrays infer float; scalar WGSL access returns the padded vec4 without selecting x.

**Dowód z pierwotnego audytu:** `uniformArray([1,2],d.u32)` ignoruje typ elementu. Three tworzy `array<vec4<f32>,2>`, a TypeGPU zwraca element jako u32. Nawet wariant f32 emituje return vec4f z funkcji ->f32: brak wyboru `.x` z poszerzonej reprezentacji.

**Metoda historycznej weryfikacji:** rzeczywisty Three WGSLNodeBuilder; odczyt wygenerowanego WGSL.

**Kod w chwili audytu:** [packages/typegpu-three/src/uniform.ts:40](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu-three/src/uniform.ts#L40).

**Testy na obecnym main:**

- **FAILED** [B10 preserves the declared unsigned uniform-array element type](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-three/tests/audit-runtime-regressions.test.ts:15)
- **FAILED** [B10 preserves the declared signed uniform-array element type](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-three/tests/audit-runtime-regressions.test.ts:20)
- **FAILED** [B10 reads the scalar component of a padded TSL uniform-array element](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-three/tests/audit-runtime-regressions.test.ts:25)

<a id="b11"></a>
## B11 — Hook bufora niszczy zasób nadal widocznego UI w React (P2)

**Obecnie: FAIL.** The committed buffer is destroyed during a suspended transition while its old UI is still committed.

**Dowód z pierwotnego audytu:** Zmiana schematu w `startTransition`, po której render zawiesza się w Suspense, pozostawia poprzednie UI na ekranie, lecz jego bufor ma już `destroyed===true`. Efekt uboczny zachodzi w renderze przed commitem. Analogiczny wzorzec w use-mutable/readonly/uniform/mirrored-uniform.

**Metoda historycznej weryfikacji:** rzeczywisty React renderer i Suspense w jsdom.

**Kod w chwili audytu:** [packages/typegpu-react/src/core/use-buffer.ts:29](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu-react/src/core/use-buffer.ts#L29).

**Testy na obecnym main:**

- **FAILED** [B11 retains the committed buffer while a schema-changing transition is suspended](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-react/tests/audit-runtime-regressions.test.tsx:8)

<a id="b12"></a>
## B12 — writeSoA myli alignment pola macierzy ze stride kolumn (P2)

**Obecnie: FAIL.** writeSoA rzuca RangeError, ponieważ większe wyrównanie pola zwiększa także stride kolumn mat3.

**Dowód z pierwotnego audytu:** `arrayOf(struct({basis:align(32,mat3x3f)}),1)` i 9 floatów rzucają RangeError: kolumny nadal powinny być co 16 B, ale kod używa 32 B i wychodzi poza bufor.

**Metoda historycznej weryfikacji:** wykonanie publicznego API; typecheck; niezależny cross-review.

**Kod w chwili audytu:** [packages/typegpu/src/common/writeSoA.ts:87](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/common/writeSoA.ts#L87).

**Testy na obecnym main:**

- **FAILED** [B12: writeSoA preserves matrix column stride under member alignment](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:14)

<a id="b13"></a>
## B13 — patch disarray używa stride tablicy WGSL (P2)

**Obecnie: FAIL.** Patch drugiego packed vec3 wychodzi poza 24-bajtowy bufor i rzuca RangeError.

**Dowód z pierwotnego audytu:** Dla `disarrayOf(vec3f,2)` patch elementu1 ma zacząć się na bajcie12. Kod wybiera16 i rzuca RangeError w poprawnym buforze24 B. Ta ścieżka obsługuje też `buffer.patch`.

**Metoda historycznej weryfikacji:** wykonanie; typecheck; niezależny cross-review.

**Kod w chwili audytu:** [packages/typegpu/src/data/partialIO.ts:94](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/data/partialIO.ts#L94).

**Testy na obecnym main:**

- **FAILED** [B13: patchArrayBuffer uses the packed disarray element stride](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:23)

<a id="b14"></a>
## B14 — memoryLayoutOf zawyża contiguous, czasem poza alokację (P2)

**Obecnie: FAIL.** Zwracane ciągłe zakresy obejmują padding; zakres końcowego pola przekracza koniec bufora.

**Dowód z pierwotnego audytu:** Root struct z array<vec3f,2> i f32: contiguous36 zamiast12. Tablica struct{u32,vec4u}:64 zamiast4. Dodatkowo selekcja ostatniego `a[1].b.z` daje offset56+contiguous12=68 przy alokacji64 B; powinna dać8. Ten ostatni wariant jest w makeArrayProxy:132.

**Metoda historycznej weryfikacji:** wykonanie trzech wariantów; typecheck; niezależny cross-review.

**Kod w chwili audytu:** [packages/typegpu/src/data/offsetUtils.ts:237](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/data/offsetUtils.ts#L237).

**Testy na obecnym main:**

- **FAILED** [B14: contiguous ranges stop at padding and the end of the allocation](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:30)

<a id="b15"></a>
## B15 — unorm10-10-10-2 ma odwróconą kolejność kanałów (P2)

**Obecnie: FAIL.** Zapis czerwonego kanału daje 4290772992 zamiast 1023; odczyt kanałów również ma odwróconą kolejność.

**Dowód z pierwotnego audytu:** Zapis czerwonego `(1,0,0,0)` daje `0xffc00000` zamiast `0x000003ff`. Reader odczytuje 1023 jako `(0,0,~0.2493,1)`. Problem jest też w fallbacku; signed >>22 daje dodatkowo ujemny red dla ustawionego najwyższego bitu.

**Metoda historycznej weryfikacji:** rzeczywisty zapis/odczyt; oficjalny WebGPU CTS; niezależny cross-review.

**Kod w chwili audytu:** [packages/typegpu/src/data/compiledIO.ts:135](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/data/compiledIO.ts#L135).

**Testy na obecnym main:**

- **FAILED** [B15: unorm10_10_10_2 stores red in the least significant ten bits](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:40)

<a id="b16"></a>
## B16 — pack4x8unorm pomija clamp i zaokrąglenie (P2)

**Obecnie: PASS.** PASS: pack4x8unorm obecnie zaokrągla 0.5 do 128 i ogranicza kanały do [0,1].

**Dowód z pierwotnego audytu:** `vec4f(0.5)` daje `0x7f7f7f7f` zamiast `0x80808080`. Dla `(-1,2,0,1)` wynik to `0xff00fe01` zamiast `0xff00ff00`. CPU i builtin GPU różnią się także dla poprawnego wejścia 0.5.

**Metoda historycznej weryfikacji:** wykonanie; specyfikacja WGSL; niezależny cross-review.

**Kod w chwili audytu:** [packages/typegpu/src/std/packing.ts:78](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/std/packing.ts#L78).

**Testy na obecnym main:**

- **PASSED** [B16: pack4x8unorm clamps and rounds each channel](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:49)

<a id="b17"></a>
## B17 — Kopiowanie mat3x3 przez std.copy/struct/array rzuca wyjątek (P2)

**Obecnie: FAIL.** std.copy(mat3) rzuca wyjątek o nieprawidłowej liczbie argumentów konstruktora.

**Dowód z pierwotnego audytu:** Wszystkie trzy wspierane ścieżki przekazują istniejącą macierz do konstruktora, który zbiera 12 liczb razem z paddingiem, po czym oczekuje9. `std.copy(mat3x3f.identity())` kończy się invalid number of arguments.

**Metoda historycznej weryfikacji:** trzy wykonane repro; poprawne typy; niezależny cross-review.

**Kod w chwili audytu:** [packages/typegpu/src/data/matrix.ts:78](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/data/matrix.ts#L78).

**Testy na obecnym main:**

- **FAILED** [B17: copying mat3 values preserves their elements and creates independent values](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:54)

<a id="b18"></a>
## B18 — Mnożenie integer vectors traci dolne bity (P2)

**Obecnie: FAIL.** Wynik mnożenia 0xffffffff × 0xffffffff ma dolne bity 0 zamiast 1.

**Dowód z pierwotnego audytu:** `mul(vec2u(0xffffffff),vec2u(0xffffffff))` zwraca `(0,0)` zamiast `(1,1)`. Zwykłe mnożenie JS traci precyzję przed obcięciem do u32; shader zachowuje dolne 32 bity.

**Metoda historycznej weryfikacji:** wykonanie; WGSL overflow modulo; niezależny cross-review.

**Kod w chwili audytu:** [packages/typegpu/src/std/operators.ts:189](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/std/operators.ts#L189).

**Testy na obecnym main:**

- **FAILED** [B18: integer vector multiplication preserves the low 32 bits](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:63)

<a id="b19"></a>
## B19 — Integer dot nie konwertuje wyniku do 32 bitów (P2)

**Obecnie: FAIL.** Dot zwraca 8589934590 zamiast wyniku u32 4294967294.

**Dowód z pierwotnego audytu:** `dot(vec2u(0xffffffff,0),vec2u(2,0))` daje 8589934590 zamiast4294967294. W tym repro JS nie traci jeszcze precyzji: odrębnym błędem jest brak końcowego zawinięcia wyniku do u32.

**Metoda historycznej weryfikacji:** wykonanie; specyfikacja WGSL; niezależny cross-review.

**Kod w chwili audytu:** [packages/typegpu/src/std/numeric.ts:434](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/std/numeric.ts#L434).

**Testy na obecnym main:**

- **FAILED** [B19: integer dot products wrap at 32 bits](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:67)

<a id="b20"></a>
## B20 — isCloseTo powiela ewaluację argumentu w shaderze (P2)

**Obecnie: FAIL.** WGSL wywołuje next() trzykrotnie; dodatkowo CPU odrzuca równość na granicy tolerancji.

**Dowód z pierwotnego audytu:** `isCloseTo(nextVector(),vec2f())` generuje aż 3 wywołania nextVector, ponieważ interpoluje lhs również jako `(lhs-lhs)`. To zmienia stan i wynik. Dodatkowo CPU używa <, GPU <=: `isCloseTo(0,1,1)` daje false na CPU. Sama granica tolerancji ma niski priorytet.

**Metoda historycznej weryfikacji:** rzeczywisty codegen ze zmieniającym stan helperem oraz CPU test granicy.

**Kod w chwili audytu:** [packages/typegpu/src/std/boolean.ts:358](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/std/boolean.ts#L358).

**Testy na obecnym main:**

- **FAILED** [B20: isCloseTo evaluates a side-effecting vector argument once](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:71)
- **FAILED** [B20: isCloseTo includes its tolerance boundary on the CPU](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:97)

<a id="b21"></a>
## B21 — Writer bez eval gubi padding mat3x3 z płaskiej tablicy (P2)

**Obecnie: FAIL.** Fallback writer zapisuje dziewięć elementów mat3 kolejno, bez paddingu między kolumnami.

**Dowód z pierwotnego audytu:** Zapis 9 liczb daje `[1,2,3,4,5,6,7,8,9,0,0,0]` zamiast `[1,2,3,0,4,5,6,0,7,8,9,0]`. Mock wyłącza tylko compiled writer, tak jak istniejące testy fallbacku; publiczne writeToArrayBuffer i serializacja są rzeczywiste.

**Metoda historycznej weryfikacji:** wykonanie fallbacku; typecheck; niezależny cross-review.

**Kod w chwili audytu:** [packages/typegpu/src/data/dataIO.ts:171](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/data/dataIO.ts#L171).

**Testy na obecnym main:**

- **FAILED** [B21: a flat mat3 input receives WGSL column padding](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-noeval-regressions.test.ts:11)

<a id="b22"></a>
## B22 — Writer bez eval ignoruje endOffset (P2)

**Obecnie: FAIL.** Fallback writer zapisuje oba pola pomimo endOffset=4.

**Dowód z pierwotnego audytu:** Bufor u32 `[7,8]`, wartość struct `{a:1,b:2}`, endOffset4: fallback nadpisuje oba pola do `[1,2]`, zamiast zostawić `[1,8]`. Obliczona granica nie trafia do writeData.

**Metoda historycznej weryfikacji:** wykonanie fallbacku; typecheck; niezależny cross-review.

**Kod w chwili audytu:** [packages/typegpu/src/data/dataIO.ts:873](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/data/dataIO.ts#L873).

**Testy na obecnym main:**

- **FAILED** [B22: endOffset prevents writes to the following struct member](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-noeval-regressions.test.ts:17)

<a id="b23"></a>
## B23 — deepEqual uznaje różne schematy tekstur za równe (P3)

**Obecnie: PASS.** PASS: deepEqual rozróżnia sampleType, format i dostęp tekstury.

**Dowód z pierwotnego audytu:** texture2d(f32) i texture2d(u32) są „równe”; także storage textures o odmiennych formatach i access. Publiczny helper wpada w końcowe true po porównaniu samego type. Nie znaleziono jego wewnętrznego użycia; nie przypisuję temu awarii pipeline.

**Metoda historycznej weryfikacji:** wykonanie; typecheck; niezależny cross-review.

**Kod w chwili audytu:** [packages/typegpu/src/data/deepEqual.ts:102](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/data/deepEqual.ts#L102).

**Testy na obecnym main:**

- **PASSED** [B23: texture schema equality distinguishes sample type, format and access](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:102)

<a id="b24"></a>
## B24 — Transformacja compound assignment podwaja ewaluację LHS (P2)

**Obecnie: FAIL.** Transformed CPU compound assignment calls the side-effectful index selector twice instead of once.

**Dowód z pierwotnego audytu:** W funkcji use gpu wykonywanej na CPU `values[next()] += 10` przy values=[1,2,3] wywołuje next dwa razy i zostawia `[12,2,3]` zamiast `[11,2,3]`. Zamiana na `lhs = add(lhs,10)` powtarza indeks/getter. Babel ma ten sam kod w :148.

**Metoda historycznej weryfikacji:** wykonany Vite/factory; Babel sprawdzony źródłowo.

**Kod w chwili audytu:** [packages/unplugin-typegpu/src/core/factory.ts:118](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/unplugin-typegpu/src/core/factory.ts#L118).

**Testy na obecnym main:**

- **FAILED** [B24: compound assignment evaluates its index once on the CPU](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-compiler-regressions.test.ts:6)

<a id="b25"></a>
## B25 — for-of wybiera iterable ponownie w każdej iteracji (P2)

**Obecnie: FAIL.** The generated loop has no iterable-selector invocation before the loop; next() remains inside the loop body and runs once per iteration.

**Dowód z pierwotnego audytu:** `for(const value of arrays[next()])` dla [[1,2],[10,20]] emituje `arrays[next()][i]` wewnątrz pętli. JS wybiera raz i sumuje3; wygenerowany WGSL wybiera dwa razy i sumowałby21.

**Metoda historycznej weryfikacji:** rzeczywisty codegen; konsekwencja liczbowa z semantyki, bez wykonania GPU.

**Kod w chwili audytu:** [packages/typegpu/src/tgsl/wgslGenerator.ts:1801](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/tgsl/wgslGenerator.ts#L1801).

**Testy na obecnym main:**

- **FAILED** [B25: for-of selects its iterable once before entering the loop](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-compiler-regressions.test.ts:21)

<a id="b26"></a>
## B26 — Cache shellless utożsamia tekstury f32 i i32 (P2)

**Obecnie: FAIL.** Only the texture_2d<f32> / vec4f helper is emitted, and the integer texture is passed to that same helper instead of a texture_2d<i32> / vec4i specialization.

**Dowód z pierwotnego audytu:** Jeden helper load wywołany dla texture_2d<f32> i texture_2d<i32> dostaje tylko specjalizację f32. Shader zawiera load(ints), mimo że deklaracja load przyjmuje texture_2d<f32>. shallowEqualSchemas pomija sampleType. Inna funkcja niż deepEqual z B23.

**Metoda historycznej weryfikacji:** rzeczywisty codegen; typecheck publicznego repro.

**Kod w chwili audytu:** [packages/typegpu/src/tgsl/shellless.ts:12](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/tgsl/shellless.ts#L12).

**Testy na obecnym main:**

- **FAILED** [B26: shellless texture overloads distinguish float and integer samples](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-compiler-regressions.test.ts:63)

<a id="b27"></a>
## B27 — Obiekty struct zmieniają kolejność lub usuwają efekty uboczne (P2)

**Obecnie: FAIL.** Struct constructor calls appear in schema order [10, 1] instead of source order [1, 10]; an extra structural-return property leaves only the increment definition and drops its invocation.

**Dowód z pierwotnego audytu:** `Pair({second:take(1),first:take(10)})` emituje take10 przed take1 zgodnie ze schematem, wbrew kolejności JS. Osobno extra field w poprawnym structural return `{a:1,ignored:increment()}` zostaje usunięte razem z runtime increment.

**Metoda historycznej weryfikacji:** rzeczywisty codegen obu wariantów; typecheck; WGSL evaluation order.

**Kod w chwili audytu:** [packages/typegpu/src/tgsl/wgslGenerator.ts:967](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/tgsl/wgslGenerator.ts#L967).

**Testy na obecnym main:**

- **FAILED** [B27: struct construction evaluates properties in source order](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-compiler-regressions.test.ts:84)
- **FAILED** [B27: structural return preserves effects of an extra property](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-compiler-regressions.test.ts:109)

<a id="b28"></a>
## B28 — Accessor f32 z callbackiem emitującym 1 generuje i32 (P2)

**Obecnie: PASS.** PASS: current main rejects a shellless GPU callback inferred as i32 for an f32 accessor before shader emission, and accepts an explicit f32 callback. Commit d0a567025 added this intentional validation, replacing the originally invalid generated WGSL.

**Dowód z pierwotnego audytu:** `accessor(d.f32,()=>{ "use gpu"; return 1; })` użyty z funkcji o wyniku f32 generuje helper ->i32, a następnie `return value()` z funkcji ->f32 bez konwersji. Typ API jawnie dopuszcza taki callback.

**Metoda historycznej weryfikacji:** rzeczywisty codegen; typecheck bez castów.

**Kod w chwili audytu:** [packages/typegpu/src/core/slot/accessor.ts:98](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/core/slot/accessor.ts#L98).

**Testy na obecnym main:**

- **PASSED** [B28: accessor validates the GPU callback schema before emitting shader code](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-compiler-regressions.test.ts:139)

<a id="b29"></a>
## B29 — Wspólne lowering emituje składnię WGSL do GLSL (P2)

**Obecnie: FAIL.** The GLSL range loop declares its index with WGSL var; the scalar conditional emits select(0, 1, flag) instead of a GLSL conditional expression.

**Dowód z pierwotnego audytu:** for-of-range zawiera `var`; runtime ternary emituje nieistniejący builtin select; pusty konstruktor struct emituje Struct() bez wymaganych pól. Trzy wykonane warianty jednej klasy brakującego rozdzielenia backendów.

**Metoda historycznej weryfikacji:** rzeczywisty codegen; reguły GLSL ES3.

**Kod w chwili audytu:** [packages/typegpu/src/tgsl/wgslGenerator.ts:1789](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/tgsl/wgslGenerator.ts#L1789).

**Testy na obecnym main:**

- **FAILED** [B29: for-of range emits a GLSL integer loop declaration](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-gl/tests/audit-compiler-regressions.test.ts:7)
- **FAILED** [B29: scalar ternary emits a GLSL conditional expression](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-gl/tests/audit-compiler-regressions.test.ts:20)

<a id="b30"></a>
## B30 — GLSL alias wykonuje comptime trzy razy (P2)

**Obecnie: FAIL.** GLSL alias resolution executes the comptime selector three times instead of once.

**Dowód z pierwotnego audytu:** `const value=values[next()]` dla comptime counter: WGSL wywołuje next raz i używa values[0]; GLSL 3 razy i używa values[2]. Zmierzony licznik na hoście. To wcześniej zgłaszany #3029, nadal odtworzony na tym HEAD; nie jest przedstawiany jako nowe odkrycie.

**Metoda historycznej weryfikacji:** wykonanie comptime + oba wygenerowane shadery.

**Kod w chwili audytu:** [packages/typegpu-gl/src/glslGenerator.ts:880](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu-gl/src/glslGenerator.ts#L880).

**Testy na obecnym main:**

- **FAILED** [B30: resolving a GLSL alias evaluates a comptime selector once](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-gl/tests/audit-compiler-regressions.test.ts:32)

<a id="b31"></a>
## B31 — Entry point nie obsługuje wszystkich poprawnych form outputu (P2)

**Obecnie: FAIL.** Returning the vertex output constructor emits return vertex_Output(...) from void main without assigning gl_Position; a scalar float output literal separately throws abstractFloat has no representation in WGSL.

**Dowód z pierwotnego audytu:** `return Out({pos:vec4f(1)})` tworzy `void main(){return Struct(...);}` zamiast przypisania gl_Position. Niezależnie pole `alpha:0.5` przy schemacie outputu `alpha:d.f32` powoduje abstractFloat error, bo pole nie otrzymuje spodziewanego typu.

**Metoda historycznej weryfikacji:** rzeczywisty codegen/wyjątek; poprawne publiczne typy.

**Kod w chwili audytu:** [packages/typegpu-gl/src/glslGenerator.ts:957](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu-gl/src/glslGenerator.ts#L957).

**Testy na obecnym main:**

- **FAILED** [B31: a vertex output constructor assigns the position builtin](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-gl/tests/audit-compiler-regressions.test.ts:47)
- **FAILED** [B31: a scalar vertex output literal receives its declared float type](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-gl/tests/audit-compiler-regressions.test.ts:56)

<a id="b32"></a>
## B32 — GLSL gubi atrybuty stage IO (P2)

**Obecnie: FAIL.** Both fragment color outputs are assigned location 0 and depth is an ordinary varying instead of gl_FragDepth. Integer stage varyings omit flat interpolation.

**Dowód z pierwotnego audytu:** Integer varying nie ma wymaganego flat. Wszystkie MRT outputy dostają location0. builtin.fragDepth zamienia się w zwykłe wyjście koloru zamiast gl_FragDepth. Repro integer varying podaje oba etapy razem, tak jak rzeczywisty root; MRT/depth sprawdzono przez fragment resolve.

**Metoda historycznej weryfikacji:** rzeczywisty paired-stage codegen; GLSL ES3.

**Kod w chwili audytu:** [packages/typegpu-gl/src/glslGenerator.ts:1085](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu-gl/src/glslGenerator.ts#L1085).

**Testy na obecnym main:**

- **FAILED** [B32: fragment outputs use separate locations and the depth builtin](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-gl/tests/audit-compiler-regressions.test.ts:67)
- **FAILED** [B32: integer stage varyings use flat interpolation on both stages](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-gl/tests/audit-compiler-regressions.test.ts:81)

<a id="b33"></a>
## B33 — Sygnatury funkcji GLSL tracą rozmiary tablic (P2)

**Obecnie: FAIL.** GLSL array parameter and return signatures both become scalar float, losing the array extent 3.

**Dowód z pierwotnego audytu:** Parametr array<f32,3> staje się `float a`, choć ciało robi a[0]. Funkcja zwracająca array<f32,3> ma wynik float, choć zwraca float[3](...).

**Metoda historycznej weryfikacji:** rzeczywisty codegen argumentu i wyniku.

**Kod w chwili audytu:** [packages/typegpu-gl/src/glslGenerator.ts:1238](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu-gl/src/glslGenerator.ts#L1238).

**Testy na obecnym main:**

- **FAILED** [B33: an array function parameter retains its extent](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-gl/tests/audit-compiler-regressions.test.ts:96)
- **FAILED** [B33: an array function return type retains its extent](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-gl/tests/audit-compiler-regressions.test.ts:112)

<a id="b34"></a>
## B34 — Skalarne std.select staje się leniwe w GLSL (P2)

**Obecnie: FAIL.** Scalar select emits a lazy conditional containing take(10u) and take(1u) in its branches; both effectful values must be evaluated before selection.

**Dowód z pierwotnego audytu:** select(take(1),take(10),flag) w WGSL wykonuje oba argumenty; GLSL zamienia je na operator ?:, wykonując jeden. Gubi efekt uboczny i może zmienić wartość zwracaną przez helper współdzielący stan.

**Metoda historycznej weryfikacji:** rzeczywisty codegen obu backendów; semantyka języków.

**Kod w chwili audytu:** [packages/typegpu-gl/src/glslGenerator.ts:730](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu-gl/src/glslGenerator.ts#L730).

**Testy na obecnym main:**

- **FAILED** [B34: scalar select evaluates both effectful values before selecting](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-gl/tests/audit-compiler-regressions.test.ts:127)

<a id="b35"></a>
## B35 — Pusty helper GLSL emituje niekompletną deklarację (P3)

**Obecnie: FAIL.** An empty GLSL function emits void empty() without body braces.

**Dowód z pierwotnego audytu:** `function empty(){"use gpu";}` generuje `void empty() ` bez ciała ani średnika. Dotyczy też funkcji, której ciało znika przez warunek compile-time.

**Metoda historycznej weryfikacji:** rzeczywisty codegen.

**Kod w chwili audytu:** [packages/typegpu-gl/src/glslGenerator.ts:1242](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu-gl/src/glslGenerator.ts#L1242).

**Testy na obecnym main:**

- **FAILED** [B35: an empty GLSL function still has a complete body](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-gl/tests/audit-compiler-regressions.test.ts:154)

<a id="b36"></a>
## B36 — Cache Perlin po resize niszczy bufor przy każdym odczycie (P2)

**Obecnie: FAIL.** Both 2D and 3D cache getters replace and destroy the resized buffer on the next read.

**Dowód z pierwotnego audytu:** Po size2×2→3×3 dwa odczyty bindings zwracają różne bufory; drugi niszczy pierwszy. dirty nigdy nie wraca do false. Identyczne w perlin-3d:191. Powtarza też alokację i compute.

**Metoda historycznej weryfikacji:** wykonanie rzeczywistego cache, GPU mock.

**Kod w chwili audytu:** [packages/typegpu-noise/src/perlin-2d/dynamic-cache.ts:188](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu-noise/src/perlin-2d/dynamic-cache.ts#L188).

**Testy na obecnym main:**

- **FAILED** [B36: resized Perlin caches retain their new buffer between reads](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-companion-regressions.test.ts:16)

<a id="b37"></a>
## B37 — Achromatyczne kolory Oklab prowadzą do NaN (P2)

**Obecnie: FAIL.** Neutral Oklab inputs reach 0/0 in computeMaxSaturation and throw a CPU finite-math error.

**Dowód z pierwotnego audytu:** preserveChroma(vec3f(0.5,0,0)), także L0 i L1, kończy się NaN finite-math error. findCusp dostaje a=b=0 i Halley update dzieli0/0. Domyślny adaptiveL05 dziedziczy tę samą matematykę.

**Metoda historycznej weryfikacji:** rzeczywista funkcja CPU; preserveChroma bez mocka, inne ścieżki z podstawieniem getterów slotów.

**Kod w chwili audytu:** [packages/typegpu-color/src/oklab.ts:285](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu-color/src/oklab.ts#L285).

**Testy na obecnym main:**

- **FAILED** [B37: gamut clipping preserves finite achromatic Oklab colors](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-companion-regressions.test.ts:37)

<a id="b38"></a>
## B38 — CLI tworzy absolutną ścieżkę pod cwd (P2)

**Obecnie: FAIL.** The returned absolute target is incorrectly prefixed with cwd; the requested directory is not created.

**Dowód z pierwotnego audytu:** prepareDirectory("/some/cwd","/tmp/my-project") tworzy /some/cwd/tmp/my-project. Pozostałe ścieżki CLI używają resolve, więc nazwa i miejsce projektu rozjeżdżają się.

**Metoda historycznej weryfikacji:** rzeczywisty tymczasowy filesystem.

**Kod w chwili audytu:** [packages/typegpu-cli/src/utils/files.ts:42](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu-cli/src/utils/files.ts#L42).

**Testy na obecnym main:**

- **FAILED** [B38: preparing an absolute project path creates that exact directory](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-cli/tests/audit-regressions.test.ts:9)

<a id="b39"></a>
## B39 — Setup WebGPU nadpisuje odziedziczone compilerOptions.types (P2)

**Obecnie: FAIL.** Baseline TypeScript diagnostics are empty; setup removes the inherited CUSTOM_GLOBAL declaration.

**Dowód z pierwotnego audytu:** Tsconfig extends bazę z types:[project-env]. Setup dodaje lokalne types:[@webgpu/types], tracąc dziedziczoną listę. Poprawny program z CUSTOM_GLOBAL po operacji dostaje TS2304.

**Metoda historycznej weryfikacji:** rzeczywisty setup i TypeScript6 przed/po.

**Kod w chwili audytu:** [packages/typegpu-cli/src/steps/webgpu-types.ts:31](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu-cli/src/steps/webgpu-types.ts#L31).

**Testy na obecnym main:**

- **FAILED** [B39: WebGPU type setup preserves globals inherited through tsconfig extends](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-cli/tests/audit-regressions.test.ts:25)

<a id="b40"></a>
## B40 — tgpu-gen emituje d.undefined dla standardowych typów (P2)

**Obecnie: FAIL.** Both generic mat4x4<f32> and vec3<f16> generate undefined struct member schemas.

**Dowód z pierwotnego audytu:** mat4x4<f32> oraz vec3<f16> są mapowane na `d.undefined`. Skrót mat4x4f działa, ale poprawna ogólna składnia WGSL nie.

**Metoda historycznej weryfikacji:** rzeczywisty Node generator.

**Kod w chwili audytu:** [packages/tgpu-gen/gen.mjs:230](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/tgpu-gen/gen.mjs#L230).

**Testy na obecnym main:**

- **FAILED** [B40: generic WGSL matrix and half-vector types map to their data schemas](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/tgpu-gen/tests/audit-regressions.test.ts:26)

<a id="b41"></a>
## B41 — tgpu-gen pomija zależności w zagnieżdżonych tablicach (P2)

**Obecnie: FAIL.** Generating a forward reference through two nested arrays throws Unknown data type: Inner.

**Dowód z pierwotnego audytu:** Outer z array<array<Inner,2>,2> przed deklaracją Inner rzuca Unknown data type: Inner. Odwrócenie deklaracji działa. Sortowanie zagląda tylko przez jedną tablicę.

**Metoda historycznej weryfikacji:** rzeczywisty Node generator; kontrola odwróconej kolejności.

**Kod w chwili audytu:** [packages/tgpu-gen/gen.mjs:61](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/tgpu-gen/gen.mjs#L61).

**Testy na obecnym main:**

- **FAILED** [B41: forward struct references inside nested arrays are sorted before evaluation](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/tgpu-gen/tests/audit-regressions.test.ts:37)

<a id="b42"></a>
## B42 — Alias runtime array generuje wolne arrayLength (P2)

**Obecnie: FAIL.** Evaluating the generated legal storage-array alias throws arrayLength is not defined.

**Dowód z pierwotnego audytu:** `alias Values=array<f32>` użyte w legalnym storage buffer generuje top-level `const Values=d.arrayOf(d.f32,arrayLength)`. Ewaluacja CommonJS rzuca ReferenceError. Alias nie dostaje fabryki parametryzowanej długością.

**Metoda historycznej weryfikacji:** rzeczywista generacja i ewaluacja JS.

**Kod w chwili audytu:** [packages/tgpu-gen/gen.mjs:170](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/tgpu-gen/gen.mjs#L170).

**Testy na obecnym main:**

- **FAILED** [B42: generated runtime-array aliases evaluate without an unbound length](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/tgpu-gen/tests/audit-regressions.test.ts:46)

<a id="b43"></a>
## B43 — Funkcje w jednej linii mają sklejone ciała w tgpu-gen (P2)

**Obecnie: FAIL.** Each generated wrapper contains both same-line WGSL function bodies.

**Dowód z pierwotnego audytu:** Dwa legalne `fn a... fn b...` w jednej linii trafiają w całości do obu wrapperów. b zaczyna się od ciała a i zawiera trailing deklarację b. Wycinanie po numerach linii gubi granice funkcji.

**Metoda historycznej weryfikacji:** rzeczywisty Node generator i zapisany output.

**Kod w chwili audytu:** [packages/tgpu-gen/gen.mjs:478](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/tgpu-gen/gen.mjs#L478).

**Testy na obecnym main:**

- **FAILED** [B43: functions on the same WGSL line keep their individual bodies](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/tgpu-gen/tests/audit-regressions.test.ts:52)

<a id="b44"></a>
## B44 — tgpu-gen nie escapuje WGSL w template literal (P2)

**Obecnie: FAIL.** A backtick in a valid WGSL comment breaks parsing of the generated JavaScript.

**Dowód z pierwotnego audytu:** Legalny komentarz blokowy WGSL zawierający backtick daje JavaScript z SyntaxError. ${...} i backslash także nie są zabezpieczone; repro używa wyłącznie nieszkodliwego backticka.

**Metoda historycznej weryfikacji:** rzeczywista generacja i parser JS.

**Kod w chwili audytu:** [packages/tgpu-gen/gen.mjs:495](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/tgpu-gen/gen.mjs#L495).

**Testy na obecnym main:**

- **FAILED** [B44: a backtick in a valid WGSL comment remains safe in generated JavaScript](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/tgpu-gen/tests/audit-regressions.test.ts:62)

<a id="b45"></a>
## B45 — Wygenerowane funkcje nie mają podłączonych helperów (P2)

**Obecnie: FAIL.** Resolved WGSL calls a() but does not include its definition.

**Dowód z pierwotnego audytu:** Dla b wołającego a, resolve wygenerowanego b zawiera return a(), ale nie ma definicji a. Generator nie emituje $uses; nawet poprawne źródło WGSL nie daje samodzielnie rozwiązywalnego helpera.

**Metoda historycznej weryfikacji:** ewaluacja wygenerowanego CommonJS + rzeczywiste tgpu.resolve.

**Kod w chwili audytu:** [packages/tgpu-gen/gen.mjs:495](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/tgpu-gen/gen.mjs#L495).

**Testy na obecnym main:**

- **FAILED** [B45: resolving a generated function includes its called helper](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/tgpu-gen/tests/audit-regressions.test.ts:66)

<a id="b46"></a>
## B46 — pnpm changes pomija co drugi zmieniony pakiet (P2)

**Obecnie: FAIL.** Actual changes() output includes alpha and gamma, but omits beta from the packages section.

**Dowód z pierwotnego audytu:** Rzeczywiste changes() w tymczasowym Git z alpha/beta/gamma wypisuje tylko alpha/gamma. Regex ma flagę g i przenosi lastIndex na kolejną ścieżkę.

**Metoda historycznej weryfikacji:** rzeczywisty CLI i tymczasowe repo Git.

**Kod w chwili audytu:** [packages/tgpu-dev-cli/changes.mjs:27](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/tgpu-dev-cli/changes.mjs#L27).

**Testy na obecnym main:**

- **FAILED** [B46: changes lists every changed package in consecutive diff entries](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/tgpu-dev-cli/tests/audit-regressions.test.ts:7)

<a id="b47"></a>
## B47 — circleVertexCount akceptuje poziom, którego circle nie obsługuje (P2)

**Obecnie: FAIL.** An index within circleVertexCount(8) causes circle() to construct NaN on CPU.

**Dowód z pierwotnego audytu:** circleVertexCount(8)=2298, ale circle szuka poziomu tylko0..7. Już indeks1146, mieszczący się w deklarowanym poziomie8, prowadzi do0/0 i NaN. Publiczny helper nie deklaruje limitu7.

**Metoda historycznej weryfikacji:** rzeczywiste funkcje CPU; jawny kontrakt liczby wierzchołków.

**Kod w chwili audytu:** [packages/typegpu-geometry/src/circle.ts:74](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu-geometry/src/circle.ts#L74).

**Testy na obecnym main:**

- **FAILED** [B47: circle produces unit vertices within the advertised level-eight count](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-companion-regressions.test.ts:46)

<a id="b48"></a>
## B48 — Sampler powierzchni półkuli może zwrócić zerowy wektor (P3)

**Obecnie: FAIL.** A valid boundary sample of 0.5 produces a zero-length hemisphere sample.

**Dowód z pierwotnego audytu:** Legalna próbka generatora0.5 i normal=(0,0,1) dają punkt na równiku. sign(dot)=0 zeruje cały wektor, choć punkt powierzchni powinien mieć długość1.

**Metoda historycznej weryfikacji:** rzeczywista matematyka; podstawiony wyłącznie getter generatora.

**Kod w chwili audytu:** [packages/typegpu-noise/src/random.ts:129](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu-noise/src/random.ts#L129).

**Testy na obecnym main:**

- **FAILED** [B48: a hemisphere sample tangent to its normal still has unit length](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-companion-regressions.test.ts:53)

<a id="b49"></a>
## B49 — Bernoulli(0) może zwrócić1 (P3)

**Obecnie: FAIL.** A valid random sample of zero makes Bernoulli(0) return 1.

**Dowód z pierwotnego audytu:** Generator może zwrócić0. Wtedy step(u,p) dla p=0 daje1, mimo prawdopodobieństwa0. Granica porównania jest inkluzywna.

**Metoda historycznej weryfikacji:** rzeczywista funkcja; podstawiony wyłącznie getter generatora.

**Kod w chwili audytu:** [packages/typegpu-noise/src/random.ts:177](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu-noise/src/random.ts#L177).

**Testy na obecnym main:**

- **FAILED** [B49: Bernoulli with zero probability never succeeds for a zero random sample](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-companion-regressions.test.ts:62)

<a id="b50"></a>
## B50 — Parser hex akceptuje częściowo błędne napisy (P3)

**Obecnie: FAIL.** Both RGB and RGBA parsers accept strings containing z characters.

**Dowód z pierwotnego audytu:** hexToRgb("#ffzzzz") zwraca niebieski zamiast odrzucić napis, bo parseInt akceptuje prefix. Dotyczy też RGBA. Niższy priorytet: wejście jest niepoprawne, lecz funkcja próbuje je walidować.

**Metoda historycznej weryfikacji:** rzeczywiste funkcje CPU.

**Kod w chwili audytu:** [packages/typegpu-color/src/hex.ts:22](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu-color/src/hex.ts#L22).

**Testy na obecnym main:**

- **FAILED** [B50: hex parsers reject strings containing non-hexadecimal digits](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-companion-regressions.test.ts:67)

<a id="b51"></a>
## B51 — Typed withIndexBuffer ignoruje sizeElements (P2)

**Obecnie: FAIL.** Typed withIndexBuffer passes the offset as 12 bytes but drops the requested twelve-byte size.

**Dowód z pierwotnego audytu:** withIndexBuffer(buffer,3,3) dla u32 powinno wiązać offset12/size12; do WebGPU trafia size:undefined, czyli cały pozostały zakres. Odczyt rozmiaru używa pozycji argumentu z innego overloadu.

**Metoda historycznej weryfikacji:** reprodukcja opisana w [raporcie](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/round2/runtime/findings.md).

**Kod w chwili audytu:** [packages/typegpu/src/core/pipeline/renderPipeline.ts:657](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/core/pipeline/renderPipeline.ts#L657).

**Testy na obecnym main:**

- **FAILED** [B51 converts the typed index buffer offset and size from elements to bytes](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:185)

<a id="b52"></a>
## B52 — Dekorowany schemat indeksów daje undefined indexFormat (P2)

**Obecnie: FAIL.** A public, location-decorated u32 index schema generates an undefined index format.

**Dowód z pierwotnego audytu:** arrayOf(location(0,u32),3) jest jawnie dopuszczone przez API i typ IsValidIndexSchema. Render path nie zdejmuje dekoracji i wywołuje setIndexBuffer z formatem undefined.

**Metoda historycznej weryfikacji:** reprodukcja opisana w [raporcie](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/round2/runtime/findings.md).

**Kod w chwili audytu:** [packages/typegpu/src/core/pipeline/renderPipeline.ts:652](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/core/pipeline/renderPipeline.ts#L652).

**Testy na obecnym main:**

- **FAILED** [B52 recognizes the format of a location-decorated u32 index schema](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:199)

<a id="b53"></a>
## B53 — Inicjalizacja skalarnego f32 zmienia -0 w +0 (P3)

**Obecnie: FAIL.** The initialized scalar -0 buffer contains bits 0x00000000 instead of 0x80000000.

**Dowód z pierwotnego audytu:** createBuffer(f32,-0) po materializacji ma bity0 zamiast0x80000000. Truthiness pomija inicjalny zapis. Kontrola z tablicą[-0] zachowuje bity. Obserwacja pamięci uploadu; bez twierdzenia o arytmetyce signed-zero na GPU.

**Metoda historycznej weryfikacji:** reprodukcja opisana w [raporcie](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/round2/runtime/findings.md).

**Kod w chwili audytu:** [packages/typegpu/src/core/buffer/buffer.ts:269](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/core/buffer/buffer.ts#L269).

**Testy na obecnym main:**

- **FAILED** [B53 preserves the sign bit when initializing a scalar f32 buffer with -0](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:213)

<a id="b54"></a>
## B54 — unwrap(vertexLayout) odrzuca poprawne zagnieżdżone atrybuty (P2)

**Obecnie: FAIL.** Unwrapping the nested vertex layout throws despite explicit locations on all leaves.

**Dowód z pierwotnego audytu:** Nested struct z location na każdym liściu rzuca „All attributes must have custom locations”. Wspierana rekurencyjna struktura attribów jest sprawdzana i mapowana wyłącznie na najwyższym poziomie.

**Metoda historycznej weryfikacji:** reprodukcja opisana w [raporcie](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/round2/runtime/findings.md).

**Kod w chwili audytu:** [packages/typegpu/src/core/vertexLayout/vertexLayout.ts:194](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/core/vertexLayout/vertexLayout.ts#L194).

**Testy na obecnym main:**

- **FAILED** [B54 unwraps nested vertex attributes with explicit leaf locations](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:253)

<a id="b55"></a>
## B55 — Luka przed bind group o jawnym indeksie blokuje dispatch (P2)

**Obecnie: FAIL.** A supplied group at explicit index two produces MissingBindGroupsError for unused lower groups.

**Dowód z pierwotnego audytu:** Jedyna używana i podpięta grupa.$idx(2) daje MissingBindGroups. new Set(sparseArray) wstawia undefined za dziury; forEach dziury pomija, więc fantomowa brakująca grupa pozostaje.

**Metoda historycznej weryfikacji:** reprodukcja opisana w [raporcie](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/round2/runtime/findings.md).

**Kod w chwili audytu:** [packages/typegpu/src/core/pipeline/drawState.ts:100](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/core/pipeline/drawState.ts#L100).

**Testy na obecnym main:**

- **FAILED** [B55 dispatches with a bind group explicitly assigned to index two](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-runtime-regressions.test.ts:273)

<a id="b56"></a>
## B56 — Three instancedArray z mat4 alokuje za mało danych (P2)

**Obecnie: FAIL.** A mat4 storage array allocates one component per element instead of sixteen.

**Dowód z pierwotnego audytu:** instancedArray(2,mat4x4f) tworzy itemSize1 i dwa floaty, zamiast itemSize16 i32floatów. Mapa typu oddaje undefined, uruchamiając upstream default float. Kontrola TSL.instancedArray(2,"mat4") działa w tej samej wersji Three.

**Metoda historycznej weryfikacji:** reprodukcja opisana w [raporcie](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/round2/runtime/findings.md).

**Kod w chwili audytu:** [packages/typegpu-three/src/instancedArray.ts:24](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu-three/src/instancedArray.ts#L24).

**Testy na obecnym main:**

- **FAILED** [B56 allocates all sixteen components of each mat4 storage-array element](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-three/tests/audit-runtime-regressions.test.ts:46)

<a id="b57"></a>
## B57 — React 19.2 rekonfiguruje canvas przy niezwiązanym rerender (P2)

**Obecnie: FAIL.** An unrelated label rerender configures the same canvas a second time.

**Dowód z pierwotnego audytu:** Zmiana wyłącznie aria-label powoduje drugie configureContext. Native useEffectEvent ma zmienną identity; użycie jako ref odpina i przypina canvas przy renderze. Wykonano real React/ReactDOM z mockiem configureContext; skutek clear/texture expiration wynika ze specyfikacji WebGPU.

**Metoda historycznej weryfikacji:** reprodukcja opisana w [raporcie](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/round2/runtime/findings.md).

**Kod w chwili audytu:** [packages/typegpu-react/src/core/use-configure-context.ts:61](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu-react/src/core/use-configure-context.ts#L61).

**Testy na obecnym main:**

- **FAILED** [B57 retains the canvas configuration on unrelated parent renders](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-react/tests/audit-runtime-regressions.test.tsx:47)

<a id="b58"></a>
## B58 — Dekorowane pola struct nie są kopiowane ani domyślnie inicjalizowane (P2)

**Obecnie: FAIL.** Kopia dekorowanego wektora aliasuje oryginał, a domyślne wartości pól są undefined.

**Dowód z pierwotnego audytu:** S=struct({v:align(16,vec3f)}), v=vec3f(1,2,3), kopia=S({v}). Zmiana kopia.v.x=99 zmienia również v.x na99. S() zwraca {v:undefined}, a pole scalar:size(16,f32) również jest undefined zamiast0. DecoratedImpl nie jest callable i nie ma $cast, więc schemaCallWrapper zwraca oryginalne item albo undefined. Dokumentowany deep copy konstruktorów przestaje działać po dodaniu metadanych layoutu. Poprawne typowo wejścia, dwie wykonane asercje. To inny błąd niż mat3-copy z rundy1: tam zawodzi liczba argumentów konstruktora, tu konstruktor inner w ogóle się nie wykonuje.

**Metoda historycznej weryfikacji:** reprodukcja opisana w [raporcie](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/round2/data/REPORT.md).

**Kod w chwili audytu:** [packages/typegpu/src/data/schemaCallWrapper.ts:20](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/data/schemaCallWrapper.ts#L20).

**Testy na obecnym main:**

- **FAILED** [B58: decorated struct members are copied and zero-initialized](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:120)

<a id="b59"></a>
## B59 — Odczyt struct zagnieżdżonego w unstruct ignoruje packed offset (P2)

**Obecnie: FAIL.** Odczyt i fallback zapis nested struct wewnątrz unstruct rzucają RangeError; kontrolny compiled zapis ma poprawne bajty.

**Dowód z pierwotnego audytu:** S=unstruct({prefix:f32,nested:struct({value:vec4f})}). sizeOf(S)=20, compiled write zapisuje poprawnie [7,1,2,3,4] jako Float32Array. readFromArrayBuffer rzuca RangeError, ponieważ inner struct przesuwa reader z bajtu4 na16 według natural alignment. Właściwe wyrównanie zewnętrzne wynika już z layoutu unstruct. Fallback writer ma ten sam problem w dataIO.ts183: także rzuca wyjątek dla tego wejścia. Jeden wspólny błąd respektowania offsetu bazowego, dwa kierunki IO. Format vertex ma offset4 i stride20, więc nie opieramy repro na nielegalnym niewyrównanym atrybucie f32.

**Metoda historycznej weryfikacji:** reprodukcja opisana w [raporcie](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/round2/data/REPORT.md).

**Kod w chwili audytu:** [packages/typegpu/src/data/dataIO.ts:627](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/data/dataIO.ts#L627).

**Testy na obecnym main:**

- **FAILED** [B59: a nested struct uses its packed offset in the fallback writer](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-noeval-regressions.test.ts:24)
- **FAILED** [B59: a struct nested inside an unstruct round-trips at its packed offset](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:129)

<a id="b60"></a>
## B60 — Helpery macierzy powielają wywołanie argumentu w WGSL (P2)

**Obecnie: FAIL.** Translation wywołuje next() trzy razy, a rotationX cztery razy zamiast raz.

**Dowód z pierwotnego audytu:** mat4x4f.translation(next()) generuje next().x, next().y, next().z, zatem next wołane3×. next zwiększa private counter i zwraca vec3f(counter); z zamierzonego przesunięcia (1,1,1) wychodzi program obliczający (1,2,3). rotationX(next()) powiela next4× w sin/cos, więc poszczególne elementy używają innych kątów i wynik nie jest zamierzoną macierzą obrotu. scaling i rotationY/Z zawierają ten sam wzorzec źródłowo. Wykonano rzeczywiste resolve dla translation i rotationX, bez GPU. Jedna grupa dla tych helperów; niezależny kod od isCloseTo z rundy1.

**Metoda historycznej weryfikacji:** reprodukcja opisana w [raporcie](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/round2/data/REPORT.md).

**Kod w chwili audytu:** [packages/typegpu/src/data/matrix.ts:589](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/data/matrix.ts#L589).

**Testy na obecnym main:**

- **FAILED** [B60: matrix translation evaluates a side-effecting argument once](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:139)
- **FAILED** [B60: matrix rotation evaluates a side-effecting argument once](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:164)

<a id="b61"></a>
## B61 — Reader SNORM zwraca wartości poniżej -1 dla legalnej reprezentacji minimum (P2)

**Obecnie: FAIL.** Minimalna reprezentacja signed normalized odczytuje się jako liczba mniejsza od -1.

**Dowód z pierwotnego audytu:** Int8Array([-128,-127]) z d.snorm8x2 daje [-1.0078740119934082,-1] zamiast[-1,-1]. Int16Array([-32768,-32767]) z snorm16x2 daje[-1.000030517578125,-1]. Brakuje ograniczenia minimalnej wartości przed normalizacją. Analogicznie scalar/x4. Sprawdzone rzeczywistym readerem; oficjalny CTS używany do walidacji vertex input jawnie mapuje min signed integer na -max przed dzieleniem.

**Metoda historycznej weryfikacji:** reprodukcja opisana w [raporcie](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/round2/data/REPORT.md).

**Kod w chwili audytu:** [packages/typegpu/src/data/dataIO.ts:693](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/data/dataIO.ts#L693).

**Testy na obecnym main:**

- **FAILED** [B61: the minimum signed normalized value decodes to minus one](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:189)

<a id="b62"></a>
## B62 — Fallback writer daje inne zaokrąglenie unorm16 i BGRA niż compiled writer (P3)

**Obecnie: FAIL.** Fallback zaokrągla 0.5 do 32767/127 zamiast 32768/128 z compiled writera.

**Dowód z pierwotnego audytu:** unorm16x2(vec2f(0.5)) zapisuje fallbackiem [32767,32767], compiled writer [32768,32768]. unorm8x4_bgra(vec4f(0.5)) daje fallbackiem [127,127,127,127], compiled [128,128,128,128]. Wariant bez eval pomija Math.round. Tylko compiledIO jest zamockowane jako niedostępne, zgodnie ze wzorcem repo; publiczna ścieżka zapisu jest rzeczywista. Pozytywny test compiled obu formatów przechodzi. To osobna implementacja od błędnego builtinu std.pack4x8unorm zgłoszonego wcześniej.

**Metoda historycznej weryfikacji:** reprodukcja opisana w [raporcie](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/round2/data/REPORT.md).

**Kod w chwili audytu:** [packages/typegpu/src/data/dataIO.ts:307](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/data/dataIO.ts#L307).

**Testy na obecnym main:**

- **FAILED** [B62: normalized formats round halfway values consistently with the compiled writer](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-noeval-regressions.test.ts:31)

<a id="b63"></a>
## B63 — Obliczenie rozmiaru schematu może przepełnić signed int32 (P3)

**Obecnie: FAIL.** sizeOf zwraca -2147483616 zamiast 2147483680, bez potrzeby alokacji dużego bufora.

**Dowód z pierwotnego audytu:** sizeOf(struct({data:arrayOf(u32,536870912),tail:f32,aligned:vec4f})) zwraca -2147483616 zamiast2147483680. roundUp używa bitowego AND, który zamienia liczbę JS na signed int32 przy wyrównywaniu offsetu większego niż2GiB. Repro nie alokuje dużego bufora; wykonuje wyłącznie publiczne obliczenie layoutu. Niski priorytet z uwagi na wymagany rozmiar i limity części urządzeń; nie twierdzimy, że każde GPU potrafi utworzyć tak duży zasób.

**Metoda historycznej weryfikacji:** reprodukcja opisana w [raporcie](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/round2/data/REPORT.md).

**Kod w chwili audytu:** [packages/typegpu/src/mathUtils.ts:8](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/mathUtils.ts#L8).

**Testy na obecnym main:**

- **FAILED** [B63: sizeOf aligns large struct offsets without signed int32 overflow](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-data-regressions.test.ts:198)

<a id="b64"></a>
## B64 — Odczyt elementu lub length tablicy usuwa efekty uboczne (P2)

**Obecnie: FAIL.** Indexing the array literal emits only take(1) and loses take(10); reading a produced array length leaves only the make definition and drops its invocation.

**Dowód z pierwotnego audytu:** [take(1),take(10)][0] emituje tylko take(1). make().length staje się stałą bez wywołania make, mimo zmiany stanu wewnątrz. Dwie optymalizacje projekcji tablicy, jedna grupa; odrębne od wcześniej zgłoszonych pól struct.

**Metoda historycznej weryfikacji:** reprodukcja opisana w [raporcie](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/round2/compiler/REPORT.md).

**Kod w chwili audytu:** [packages/typegpu/src/tgsl/accessIndex.ts:44](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/tgsl/accessIndex.ts#L44).

**Testy na obecnym main:**

- **FAILED** [B64: indexing an array literal retains effects of every element](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-compiler-regressions.test.ts:171)
- **FAILED** [B64: reading array length retains effects of the array producer](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-compiler-regressions.test.ts:196)

<a id="b65"></a>
## B65 — Konwersja array<f32> do array<i32> pomija konwersję elementów (P2)

**Obecnie: FAIL.** CPU conversion control passes with [1, 2], but WGSL copies the float array verbatim with let converted = values rather than converting its elements to i32.

**Dowód z pierwotnego audytu:** Ints(Floats([1.5,2.5])) na CPU daje[1,2]. W shaderze converted=values zachowuje array<f32>, po czym funkcja ->i32 zwraca element f32. Porównanie samego .type uznaje oba schematy array za identyczne.

**Metoda historycznej weryfikacji:** reprodukcja opisana w [raporcie](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/round2/compiler/REPORT.md).

**Kod w chwili audytu:** [packages/typegpu/src/tgsl/conversion.ts:44](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/tgsl/conversion.ts#L44).

**Testy na obecnym main:**

- **FAILED** [B65: copying an array to an integer schema converts each element](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-compiler-regressions.test.ts:219)

<a id="b66"></a>
## B66 — Pipeline gubi uzgodnione lokacje varyings (P2)

**Obecnie: FAIL.** Only one color declaration has location 5: the fragment input. The inferred vertex output remains at location 0.

**Dowód z pierwotnego audytu:** Auto vertex oraz fragment z color@location(5) tworzą wyjście vertex@0 i wejście fragment@5. Wyliczona mapa nie trafia do autoOut. Jawny konflikt1/2 również nie stosuje deklarowanej precedence; policzony w tej samej grupie.

**Metoda historycznej weryfikacji:** reprodukcja opisana w [raporcie](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/round2/compiler/REPORT.md).

**Kod w chwili audytu:** [packages/typegpu/src/core/function/autoIO.ts:137](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/core/function/autoIO.ts#L137).

**Testy na obecnym main:**

- **FAILED** [B66: inferred vertex output uses the explicit fragment input location](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-compiler-regressions.test.ts:237)

<a id="b67"></a>
## B67 — Unplugin zmienia mutowalną deklarację funkcji JavaScript w const (P2)

**Obecnie: FAIL.** Both Babel and Rollup transform a mutable JavaScript function declaration into a const binding; transformed legal input throws Assignment to constant variable, while untransformed input records 2.

**Dowód z pierwotnego audytu:** Legalne JS function shader(){"use gpu";return1}; shader=()=>2 działa przed transformacją. Babel i Rollup emitują const shader, a wykonanie rzuca Assignment to constant variable. Zakres dotyczy JS; TS sam zabrania takiego przypisania.

**Metoda historycznej weryfikacji:** reprodukcja opisana w [raporcie](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/round2/compiler/REPORT.md).

**Kod w chwili audytu:** [packages/unplugin-typegpu/src/core/factory.ts:64](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/unplugin-typegpu/src/core/factory.ts#L64).

**Testy na obecnym main:**

- **FAILED** [B67: Babel preserves reassignment of a JavaScript function declaration](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/unplugin-typegpu/test/audit-compiler-regressions.test.ts:8)
- **FAILED** [B67: Rollup preserves reassignment of a JavaScript function declaration](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/unplugin-typegpu/test/audit-compiler-regressions.test.ts:8)

<a id="b68"></a>
## B68 — Ujemny return oczekiwanego u32 generuje nielegalne -1u (P2)

**Obecnie: FAIL.** The CPU return coercion control passes with 4294967295, but WGSL still emits invalid return -1u instead of a representable unsigned value.

**Dowód z pierwotnego audytu:** tgpu.fn([],u32)(()=>-1) ma poprawne typy i na CPU zwraca4294967295, ale WGSL emituje return -1u. Unary minus nie obsługuje u32. Rzeczywisty codegen; brak wykonania na driverze.

**Metoda historycznej weryfikacji:** reprodukcja opisana w [raporcie](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/round2/compiler/REPORT.md).

**Kod w chwili audytu:** [packages/typegpu/src/tgsl/conversion.ts:56](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu/src/tgsl/conversion.ts#L56).

**Testy na obecnym main:**

- **FAILED** [B68: negative integer return wraps to a representable unsigned literal](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-compiler-regressions.test.ts:257)

<a id="b69"></a>
## B69 — GLSL textureLoad dwukrotnie wykonuje producenta współrzędnych (P2)

**Obecnie: FAIL.** The generated fragment source contains one nextCoords definition and three textual invocations in the coordinate expression, rather than one invocation materialized for both coordinate components.

**Dowód z pierwotnego audytu:** textureLoad(view,nextCoords(),0) generuje nextCoords().x oraz nextCoords().y w wybranej gałęzi flipY. Runtime funkcja zmienia stan dwukrotnie i składowe mogą pochodzić z różnych wyników. Odrębne od wcześniejszego wielokrotnego comptime przy aliasie GLSL.

**Metoda historycznej weryfikacji:** reprodukcja opisana w [raporcie](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/round2/compiler/REPORT.md).

**Kod w chwili audytu:** [packages/typegpu-gl/src/glslGenerator.ts:664](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu-gl/src/glslGenerator.ts#L664).

**Testy na obecnym main:**

- **FAILED** [B69: textureLoad evaluates its coordinate producer once](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu-gl/tests/audit-compiler-regressions.test.ts:162)

<a id="b70"></a>
## B70 — tgpu-gen nadpisuje inny plik dla output path zawierającego # (P2)

**Obecnie: FAIL.** The real CLI overwrites an unrelated out file and does not create the requested out#1.ts.

**Dowód z pierwotnego audytu:** Rzeczywisty CLI: shader.wgsl -o out#1.ts, istniejący plik out. Bez --overwrite polecenie nadpisuje out, nie tworzy out#1.ts i kończy exit0. Preflight sprawdza ścieżkę jako string, zapis używa URL usuwającego fragment.

**Metoda historycznej weryfikacji:** reprodukcja opisana w [raporcie](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/round2/companion/findings.md).

**Kod w chwili audytu:** [packages/tgpu-gen/gen.mjs:35](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/tgpu-gen/gen.mjs#L35).

**Testy na obecnym main:**

- **FAILED** [B70: CLI output containing a hash preserves unrelated existing files](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/tgpu-gen/tests/audit-regressions.test.ts:73)

<a id="b71"></a>
## B71 — tgpu-gen scala różne outputy przez nieescapowane znaki globu (P2)

**Obecnie: FAIL.** The real CLI does not preserve the one/two subdirectories for src(v2)/**/*.wgsl.

**Dowód z pierwotnego audytu:** Rzeczywisty CLI dla src(v2)/**/*.wgsl i out/**/*.ts znajduje one/shader oraz two/shader, ale zapisuje oba do out/shader.ts. Nawiasy w ścieżce trafiają bez escapowania do RegExp; jeden wynik zostaje utracony, exit0.

**Metoda historycznej weryfikacji:** reprodukcja opisana w [raporcie](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/round2/companion/findings.md).

**Kod w chwili audytu:** [packages/tgpu-gen/outputPathCompiler.mjs:15](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/tgpu-gen/outputPathCompiler.mjs#L15).

**Testy na obecnym main:**

- **FAILED** [B71: CLI output globs preserve folders when an input directory contains parentheses](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/tgpu-gen/tests/audit-regressions.test.ts:91)

<a id="b72"></a>
## B72 — Legalne nazwy WGSL kolidują z deklaracjami generatora (P2)

**Obecnie: FAIL.** Generated JavaScript throws duplicate-identifier SyntaxError for d, tgpu and layout0.

**Dowód z pierwotnego audytu:** struct d koliduje z importem d; fn tgpu z importem tgpu; struct layout0 z nazwą generowanego bindGroupLayout. Faktycznie wygenerowany CommonJS rzuca SyntaxError przy parsowaniu. Jedna grupa braku obsługi przestrzeni nazw.

**Metoda historycznej weryfikacji:** reprodukcja opisana w [raporcie](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/round2/companion/findings.md).

**Kod w chwili audytu:** [packages/tgpu-gen/gen.mjs:504](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/tgpu-gen/gen.mjs#L504).

**Testy na obecnym main:**

- **FAILED** [B72: legal WGSL names do not collide with imports or generated layouts](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/tgpu-gen/tests/audit-regressions.test.ts:115)

<a id="b73"></a>
## B73 — XOROSHIRO może utknąć w permanentnym stanie zerowym (P2)

**Obecnie: FAIL.** The specified finite seed produces 32 zero samples rather than escaping the absorbing state.

**Dowód z pierwotnego audytu:** seed2(vec2f(28.8883056640625,-3.9062703131821294e-15)) ma obie składowe w rekomendowanym zakresie. Scramble i hash tworzą stan(0,0); 32 próbki to same zera, a recurrence zachowuje ten stan na zawsze. seed(1) stanowi działającą kontrolę.

**Metoda historycznej weryfikacji:** reprodukcja opisana w [raporcie](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/round2/companion/findings.md).

**Kod w chwili audytu:** [packages/typegpu-noise/src/generator.ts:155](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu-noise/src/generator.ts#L155).

**Testy na obecnym main:**

- **FAILED** [B73: a finite seed in the recommended range cannot trap XOROSHIRO at zero](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-companion-regressions.test.ts:72)

<a id="b74"></a>
## B74 — sdBezier zwraca znaczną odległość dla punktu leżącego na małej krzywej (P2)

**Obecnie: FAIL.** Distance at the exact quadratic midpoint is 0.0006321070250123739 instead of approximately zero.

**Dowód z pierwotnego audytu:** A=(0,0),B=(.001,.0005),C=(.002,0), P=(.001,.00025) dokładnie dla t=.5. Wynik0.000632107 zamiast0; po skali1000 wynik0. Stały próg max(dot(b,b),.0001) zmienia równanie. Krzywa nie jest kollinearna.

**Metoda historycznej weryfikacji:** reprodukcja opisana w [raporcie](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/round2/companion/findings.md).

**Kod w chwili audytu:** [packages/typegpu-sdf/src/2d.ts:100](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu-sdf/src/2d.ts#L100).

**Testy na obecnym main:**

- **FAILED** [B74: a point on a small non-collinear quadratic Bezier has zero distance](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-companion-regressions.test.ts:82)

<a id="b75"></a>
## B75 — Prosta łamana z dodatnimi promieniami rzuca NaN na CPU (P2)

**Obecnie: FAIL.** The straight positive-radius polyline throws a CPU NaN error in intersectLines before returning its center vertex.

**Dowód z pierwotnego audytu:** polylineVariableWidth dla czterech punktów(0,0)..(3,0), promień.1, vertexIndex0, maxJoinCount2 rzuca przed zwróceniem środka. intersectLines dzieli przez0 i tworzy NaN point zanim select zdąży wybrać fallback. Brak twierdzenia o wyjątku GPU.

**Metoda historycznej weryfikacji:** reprodukcja opisana w [raporcie](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/round2/companion/findings.md).

**Kod w chwili audytu:** [packages/typegpu-geometry/src/utils.ts:119](https://github.com/software-mansion/TypeGPU/blob/e94c367b9117eb561889a8f91f32f0ab4c5d2db9/packages/typegpu-geometry/src/utils.ts#L119).

**Testy na obecnym main:**

- **FAILED** [B75: a straight polyline with positive radii returns its center vertex on CPU](/Users/michal/.codex/worktrees/003b/TypeGPU/packages/typegpu/tests/audit-companion-regressions.test.ts:93)

## Doprecyzowania

- B28: naprawa na main polega na walidacji i odrzuceniu callbacku zwracającego niezgodny konkretny typ; dodatnia kontrola z jawnym f32 przechodzi. Nie wymuszono historycznie sugerowanej konwersji.
- B30 był już znany jako #3029; nie jest nowym odkryciem audytu.
- B48 i B49 wymuszają dozwolone wartości generatora losowego, aby deterministycznie sprawdzić przypadki brzegowe.
- B53 dotyczy bitów -0 przy hostowej inicjalizacji bufora, nie gwarancji znaku zera we wszystkich obliczeniach GPU.
- B57 to React 19.2 i mock konfiguracji canvas; skutków na sterowniku nie mierzono.
- B67 używa poprawnego JavaScriptu przekazanego do obu transformów. TypeScript odrzuca analogiczne przypisanie do deklaracji funkcji.
- B75 odtwarza wyjątek CPU podczas generacji geometrii.

## Niezależny przegląd testów

- [Przegląd testów danych](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/testing-current/data-cross-review.md)
- [Przegląd pakietów pomocniczych](/Users/michal/.codex/visualizations/2026/09/24/01a0d3e3-9259-7cb3-8260-1f4a79cd73a1/typegpu-audit/testing-current/companion-cross-review.json)
