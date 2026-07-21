# qExtrai

Applicazione desktop qExtrai basata su React e Tauri.

## Database condiviso

La configurazione PostgreSQL è disponibile nelle Preferenze dell'app desktop. qExtrai usa PostgreSQL nativo tramite SQLx e non richiede driver esterni installati sulla postazione.

I parametri richiesti sono server, porta PostgreSQL, database, utente, password e SSL mode. Il backend Rust usa `PgConnectOptions` e imposta separatamente host, porta, database, utente, password, SSL mode e application name `qExtrai`.

La password viene protetta localmente con DPAPI per l'utente Windows corrente e salvata come blob Base64 nel file di configurazione della postazione. Non vengono salvate password in chiaro o URL con credenziali.

Il file locale è `database-settings.json` dentro `app_local_data_dir()`. Contiene versione del formato, impostazioni non sensibili e password cifrata. La configurazione è per singola postazione, mentre PostgreSQL è pensato come database condiviso tra operatori.

qExtrai usa un database PostgreSQL dedicato, indicativamente `qextrai`; l'applicazione non crea il database. Al primo accesso al catalogo esegue migrazioni SQLx incorporate nell'eseguibile e crea lo schema `qextrai` con le tabelle condivise.

L'utente configurato deve poter connettersi al database dedicato, creare lo schema iniziale, applicare le migrazioni SQLx, leggere e modificare le tabelle qExtrai. SQLx gestisce la propria tabella di controllo migrazioni.

Il catalogo campi è condiviso tra le postazioni collegate allo stesso database. Ogni campo ha una `revision`; gli aggiornamenti formato usano la revisione attesa per evitare sovrascritture silenziose tra operatori.

I template documentali sono condivisi in PostgreSQL nelle tabelle `qextrai.document_templates`, `qextrai.document_template_fields`, `qextrai.document_template_regions` e `qextrai.document_template_bindings`. Un template salva il layout dei campi e delle aree normalizzate per pagina; l'associazione automatica al documento usa l'impronta SHA-256 del file e consente di riapplicare lo stesso layout quando il documento viene riaperto.

Un operatore puo salvare il documento corrente come template, aggiornare un template attivo con controllo di `revision`, ricaricare la versione condivisa oppure applicare manualmente un template esistente a un documento simile. Se il documento corrente ha meno pagine del template sorgente, le aree su pagine non disponibili restano nel layout ma vengono segnalate come non visibili.

In modalità browser il catalogo resta temporaneo in memoria. Se il server PostgreSQL non è disponibile in desktop, qExtrai continua ad aprire documenti e mantenere il catalogo già visibile, ma impedisce nuove modifiche persistenti finché il catalogo condiviso non torna disponibile.

In questa fase non vengono persistiti i documenti originali, i valori estratti, OCR, estrazioni o esportazioni. Sono persistiti solo catalogo campi condiviso, template e associazioni documento-template.

## Estrazione dati locale

L'app desktop puo leggere testo dai PDF nativi usando esclusivamente le aree definite dall'operatore nel template o nel layout corrente. Il frontend trasferisce il PDF al backend Tauri come body binario raw, senza Base64 o array JSON; il backend calcola l'impronta SHA-256, crea un file temporaneo di sessione e restituisce solo token opaco, fingerprint e numero pagine.

Il comando `Estrai dati` supporta al momento solo campi `single`. Per ogni area inviata, il backend apre il PDF locale e legge il testo circoscritto al rettangolo ricevuto; non legge l'intera pagina per cercare valori e non usa PDF.js per l'estrazione testuale. I valori vengono mostrati nel pannello campi, sono modificabili manualmente e restano solo nello stato del documento corrente.

Non sono ancora disponibili OCR, immagini o PDF scannerizzati, LLM/API esterne, campi elenco, tabelle, persistenza dei valori ed esportazione. In browser il viewer continua a funzionare, ma l'estrazione mostra che la funzione e disponibile solo nell'app desktop. I PDF temporanei vengono eliminati quando il documento viene sostituito, quando il token viene rilasciato, alla chiusura dell'app o in caso di errore di staging.

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

L'applicazione non esegue OCR, LLM o chiamate internet durante l'estrazione.
