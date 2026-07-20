# qExtrai

Applicazione desktop qExtrai basata su React e Tauri.

## Database condiviso

La configurazione PostgreSQL è disponibile nelle Preferenze dell'app desktop. qExtrai usa PostgreSQL nativo tramite SQLx e non richiede driver esterni installati sulla postazione.

I parametri richiesti sono server, porta PostgreSQL, database, utente, password e SSL mode. Il backend Rust usa `PgConnectOptions` e imposta separatamente host, porta, database, utente, password, SSL mode e application name `qExtrai`.

La password viene protetta localmente con DPAPI per l'utente Windows corrente e salvata come blob Base64 nel file di configurazione della postazione. Non vengono salvate password in chiaro o URL con credenziali.

Il file locale è `database-settings.json` dentro `app_local_data_dir()`. Contiene versione del formato, impostazioni non sensibili e password cifrata. La configurazione è per singola postazione, mentre PostgreSQL è pensato come database condiviso tra operatori.

qExtrai usa un database PostgreSQL dedicato, indicativamente `qextrai`; l'applicazione non crea il database. Al primo accesso al catalogo esegue migrazioni SQLx incorporate nell'eseguibile e crea lo schema `qextrai` con la tabella `qextrai.field_definitions`.

L'utente configurato deve poter connettersi al database dedicato, creare lo schema iniziale, applicare le migrazioni SQLx, leggere e modificare le tabelle qExtrai. SQLx gestisce la propria tabella di controllo migrazioni.

Il catalogo campi è condiviso tra le postazioni collegate allo stesso database. Ogni campo ha una `revision`; gli aggiornamenti formato usano la revisione attesa per evitare sovrascritture silenziose tra operatori.

In modalità browser il catalogo resta temporaneo in memoria. Se il server PostgreSQL non è disponibile in desktop, qExtrai continua ad aprire documenti e mantenere il catalogo già visibile, ma impedisce nuove modifiche persistenti finché il catalogo condiviso non torna disponibile.

In questa fase non vengono persistiti documenti, regioni, valori, template, OCR, estrazioni o esportazioni.

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
