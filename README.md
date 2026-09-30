# Hollihop Client

Android ilova: HolliHop (sensorika.t8s.ru) o'qituvchi kabinetidagi kundalik ishlarni avtomatlashtiradi.

## Qanday ishlaydi
Ilova ichida haqiqiy Chromium brauzer (WebView) bor. U saytga login/parol bilan xuddi odam kabi kiradi,
cookie va CSRF tokenlarni o'zi saqlaydi. Ilovaning barcha so'rovlari shu kirilgan sahifa ichidan `fetch()`
orqali yuboriladi, shuning uchun sayt ularni oddiy brauzer so'rovidan ajrata olmaydi. Sessiya telefonda
saqlanadi. U tugasa, ilova avtomatik qayta kiradi. Parol Android Keystore bilan shifrlanadi.

## Imkoniyatlar
- Guruhlar, o'quvchilarni qidirish (lotin/kirill), o'quvchining guruhlari
- Davomat: keldi / kechikdi (daqiqa) / sababli (sabab) / sababsiz, "hammasi keldi"
- Baholash: dars mavzusi, bittalab baho, "hammaga N", **avto-baho** (oldingi baholar va davomat asosida)
- Kelmaganlarga bir bosishda qo'ng'iroq / SMS (o'quvchi va ota-ona raqamlari), qo'ng'iroq natijasini belgilash
- Tahlil: bahosi past, bahosi tushayotgan, aktiv, ko'p dars qoldirgan, qarzdorlar; kelmagan kunlar tarixi
- Internet yo'q bo'lsa ham yozuvlar telefonda saqlanadi va keyin saytga yuboriladi
- "Brauzer": sayt o'zi, xuddi shu sessiya bilan; "Tarmoq jurnali": sayt yuborgan so'rovlarni yozib oladi

## Tuzilishi
- `app/src/main/java/...` — native qism: `MainActivity` (ikkita WebView), `Engine` (login, sessiya, so'rovlar), `Store`
- `app/src/main/assets/engine` — sayt sahifasiga kiritiladigan skriptlar (login, fetch+CSRF, tarmoq yozuvchisi)
- `app/src/main/assets/app` — ilova interfeysi (HTML/JS)
- `tools/ui-test.js` — interfeysni soxta sayt bilan Chromium'da sinash: `NODE_PATH=$(npm root -g) node tools/ui-test.js`

## APK
GitHub Actions har bir push'da imzolangan release APK yig'adi va GitHub Releases'ga joylaydi.
