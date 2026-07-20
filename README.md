# qExtrai

Applicazione desktop qExtrai basata su React e Tauri.

## Database condiviso

La configurazione PostgreSQL è disponibile nelle Preferenze dell'app desktop. qExtrai usa PostgreSQL nativo tramite SQLx e non richiede driver esterni installati sulla postazione.

I parametri richiesti sono server, porta PostgreSQL, database, utente, password e SSL mode. Il backend Rust usa `PgConnectOptions` e imposta separatamente host, porta, database, utente, password, SSL mode e application name `qExtrai`.

La password viene protetta localmente con DPAPI per l'utente Windows corrente e salvata come blob Base64 nel file di configurazione della postazione. Non vengono salvate password in chiaro o URL con credenziali.

Il file locale è `database-settings.json` dentro `app_local_data_dir()`. Contiene versione del formato, impostazioni non sensibili e password cifrata. La configurazione è per singola postazione, mentre PostgreSQL è pensato come database condiviso tra operatori.

In questa fase non vengono create tabelle PostgreSQL, non viene persistito alcun catalogo e non viene salvato alcun dato documentale.

## Comandi

```bash
npm install
npm.cmd run dev
npm.cmd run lint
npm.cmd run test
npm.cmd run build
npm.cmd run desktop:dev
npm.cmd run desktop:build
```

L'applicazione non include backend, OCR, lettura PDF reale o chiamate esterne.
