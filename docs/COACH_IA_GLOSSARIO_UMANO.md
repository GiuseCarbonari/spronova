# Coach IA — Traduzioni umane delle metriche

Ogni metrica mostra: **etichetta umana (SIGLA)** · valore · **micro-frase di stato** con colore/freccia.
La sigla resta per gli esperti, la frase spiega ai principianti, l'indicatore dice subito se è buono.

REGOLA FERMA: gli indicatori di stato seguono la logica Section 11.
In particolare un TSB negativo NON è un allarme (−10/−30 è normale). Non reintrodurre
falsi allarmi nell'UI che il motore evita di proposito.

---

## 1. READINESS — la decisione del giorno

Sostituire GO/MODIFY/SKIP con parole + il codice tecnico piccolo accanto.

| Stato | Parola grande (nuova) | Codice piccolo | Frase sotto |
|---|---|---|---|
| GO | **Via libera** | GO | "Sei pronto per la seduta prevista." |
| MODIFY | **Vai più piano oggi** | MODIFY | "I tuoi segnali suggeriscono di alleggerire." |
| SKIP | **Oggi riposa** | SKIP | "Il corpo ha bisogno di recupero. Meglio fermarsi." |

Il colore resta (verde/giallo/rosso). Sotto, una riga: "Perché?" che apre i segnali che hanno determinato la decisione.

---

## 2. METRICHE CARICO/RECUPERO

Formato card: `ETICHETTA UMANA (SIGLA)` in alto · valore grande · micro-frase di stato sotto con freccia/colore.

### CTL → "Forma fisica"
- Etichetta: **Forma fisica (CTL)**
- Cos'è (tooltip): "Quanto allenamento hai accumulato nelle ultime settimane. Più è alta, più sei 'in forma' di fondo. Cresce lentamente con l'allenamento costante."
- Stato:
  - in aumento → freccia su, neutro/positivo: "in crescita"
  - stabile → "stabile"
  - in calo → freccia giù, neutro: "in calo" (non rosso: calare può essere voluto)

### ATL → "Fatica recente"
- Etichetta: **Fatica recente (ATL)**
- Cos'è: "Quanto sei stanco per gli allenamenti degli ultimi giorni. Sale dopo sessioni dure, scende col riposo."
- Stato: descrittivo, non giudicante: "alta" / "moderata" / "bassa". Nessun colore allarme.

### TSB → "Freschezza"
- Etichetta: **Freschezza (TSB)**
- Cos'è: "Quanto sei riposato rispetto al tuo carico. Positivo = fresco e scattante. Leggermente negativo è NORMALE quando ti alleni sodo: significa che stai costruendo forma."
- Stato (ATTENZIONE alla logica):
  - TSB > +5 → "fresco" (verde tenue)
  - TSB −10 a +5 → "equilibrato" (neutro)
  - TSB −10 a −30 → "sotto carico (normale in costruzione)" (neutro, NON rosso)
  - TSB < −30 → "molto affaticato" (giallo)
- MAI mostrare TSB negativo come "cattivo" di per sé.

### ACWR → "Equilibrio del carico"
- Etichetta: **Equilibrio del carico (ACWR)**
- Cos'è: "Confronta quanto ti alleni adesso rispetto alle ultime settimane. Tra 0.8 e 1.3 è la zona sicura. Troppo alto = rischio di strafare."
- Stato:
  - 0.8–1.3 → "equilibrato" (verde tenue)
  - < 0.8 → "carico leggero" (neutro)
  - 1.3–1.5 → "carico alto" (giallo)
  - > 1.5 → "rischio sovraccarico" (rosso)

### HRV → "Variabilità cardiaca"
- Etichetta: **Variabilità cardiaca (HRV)**
- Cos'è: "Quanto varia il tempo tra un battito e l'altro a riposo. Più è alta, più il tuo sistema nervoso è recuperato. Si misura al mattino con una fascia cardio o uno smartwatch compatibile."
- Se assente: "—" + "Collega una misurazione mattutina per attivarla"

### RHR → "Battito a riposo"
- Etichetta: **Battito a riposo (RHR)**
- Cos'è: "I tuoi battiti al minuto da fermo. Se sale di colpo, spesso è segno di stanchezza o di un malanno in arrivo. Si misura al mattino."
- Se assente: "—" + "Collega una misurazione mattutina per attivarla"

---

## 3. METRICHE PROFILO (scheda atleta)

### CP → "Potenza di soglia"
- Etichetta: **Potenza di soglia (CP)**
- Cos'è: "La potenza che riesci a tenere a lungo senza crollare. È il miglior indicatore della tua capacità di reggere ritmi alti in salita e nelle uscite lunghe."

### W/kg → "Potenza per chilo"
- Cos'è: "I tuoi watt divisi per il peso. È ciò che conta davvero in salita: a parità di watt, chi pesa meno sale più veloce."

### W′ → "Batteria anaerobica"
- Etichetta: **Batteria anaerobica (W′)**
- Cos'è: "L'energia extra che puoi spendere negli scatti e negli sforzi brevi sopra la tua soglia. Come una batteria: si scarica con gli sforzi intensi e si ricarica quando rallenti."

### APR/MPR → "Riserva di scatto"
- Etichetta: **Riserva di scatto**
- Cos'è: "Quanto la tua punta di sprint supera la tua soglia. Alta = sei esplosivo. È la dote dei velocisti e dei puncheur."

---

## 4. CHIAVE DELLA QUALITÀ DATI

"Qualità dati 3/4" è criptico. Sostituire con:
- 4/4: "Dati completi" (verde)
- 3/4: "Dati buoni — manca il recupero mattutino (HRV/battito)" (neutro)
- 2/4: "Dati base — il coach è più prudente" (giallo)
- 1/4: "Dati minimi — collega più sensori per consigli precisi" (giallo)

---

## 5. REGOLA TRASVERSALE

- Ogni sigla appare SEMPRE accompagnata dall'etichetta umana, almeno alla prima occorrenza nella pagina.
- Ogni metrica ha un "?" che apre il "Cos'è" sopra.
- Gli indicatori di stato usano parole semplici + colore, MAI solo un numero nudo.
- Il colore segue la logica Section 11: neutro dove il valore è normale anche se "negativo".
- Tono: incoraggiante, mai allarmista. "Sotto carico (normale)" non "ATTENZIONE TSB BASSO".
