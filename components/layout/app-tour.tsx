"use client";

import { useEffect } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

const TOUR_KEY = "curveload_tour_v2";

export function AppTour() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(TOUR_KEY)) return;

    const d = driver({
      animate: true,
      smoothScroll: true,
      showProgress: true,
      progressText: "{{current}} di {{total}}",
      nextBtnText: "Avanti →",
      prevBtnText: "← Indietro",
      doneBtnText: "Inizia ad allenarti →",
      overlayOpacity: 0.75,
      stagePadding: 10,
      stageRadius: 18,
      popoverClass: "curveload-tour-popover",
      onDestroyStarted: () => {
        localStorage.setItem(TOUR_KEY, "1");
        d.destroy();
      },
      steps: [
        // ── Dashboard ──────────────────────────────────────────────
        {
          popover: {
            title: "Benvenuto in CurveLoad",
            description:
              "Questa è la tua dashboard quotidiana. Ti mostra tutto quello che serve in un colpo d'occhio: come stai, cosa fare oggi e come sta andando il tuo allenamento.",
            side: "over",
            align: "center",
          },
        },
        {
          element: "#tour-refresh",
          popover: {
            title: "Sincronizza i dati",
            description:
              "Premi qui ogni mattina per leggere i dati aggiornati da Intervals.icu: HRV, sonno, frequenza cardiaca a riposo e carico degli ultimi 7 giorni.",
            side: "bottom",
            align: "start",
          },
        },
        {
          element: "#tour-readiness",
          popover: {
            title: "Readiness — sei pronto?",
            description:
              "Il punteggio da 0 a 100 combina tutti i segnali biologici e di carico. Verde = vai, giallo = riduci l'intensità, rosso = riposa. La decisione è automatica ma tu puoi sempre ignorarla.",
            side: "bottom",
            align: "center",
          },
        },
        {
          element: "#tour-session",
          popover: {
            title: "La seduta di oggi",
            description:
              "Tipo di allenamento, durata e zona di potenza suggeriti per oggi. Viene già sincronizzata sul tuo calendario Intervals.icu — la trovi nell'app o sul ciclocomputer.",
            side: "bottom",
            align: "center",
          },
        },
        {
          element: "#tour-metrics",
          popover: {
            title: "Le tue metriche di carico",
            description:
              "CTL è la tua forma fisica a lungo termine. ATL è la fatica degli ultimi 7 giorni. TSB è la differenza: positivo = fresco, negativo = sotto carico. ACWR sopra 1.3 segnala rischio di sovraccarico. Tocca ⓘ su ognuna per la spiegazione completa.",
            side: "top",
            align: "center",
          },
        },
        {
          element: "#tour-trend-chart",
          popover: {
            title: "Andamento negli ultimi 30 giorni",
            description:
              "Il grafico mostra come CTL, ATL e TSB si sono evoluti nell'ultimo mese. Utile per capire se stai costruendo forma o accumulando troppa fatica.",
            side: "top",
            align: "center",
          },
        },
        // ── Piano ──────────────────────────────────────────────────
        {
          element: "#tour-tab-plan",
          popover: {
            title: "Piano settimanale",
            description:
              "Ogni settimana puoi generare un piano di allenamento personalizzato. CurveLoad legge il tuo dossier, la fase corrente e la readiness per distribuire i carichi in modo intelligente.",
            side: "top",
            align: "center",
          },
        },
        {
          element: "#tour-generate-btn",
          popover: {
            title: "Genera o rigenera",
            description:
              "Un click e CurveLoad costruisce la settimana: quante sessioni intense, quanto volume, quando recuperare. Puoi rigenerare ogni volta che cambia qualcosa.",
            side: "bottom",
            align: "start",
          },
        },
        {
          element: "#tour-week-grid",
          popover: {
            title: "La griglia dei 7 giorni",
            description:
              "Ogni giorno mostra tipo di sessione, durata e zona. I giorni già completati mostrano la percentuale di rispetto. Puoi redistribuire le sessioni se la settimana cambia.",
            side: "top",
            align: "center",
          },
        },
        {
          element: "#tour-push-btn",
          popover: {
            title: "Carica su Intervals.icu",
            description:
              "Con un click il piano viene pubblicato sul tuo calendario Intervals.icu. Lo ritrovi nell'app, sul sito e sul ciclocomputer Garmin/Wahoo.",
            side: "top",
            align: "center",
          },
        },
        // ── Profilo ────────────────────────────────────────────────
        {
          element: "#tour-tab-profile",
          popover: {
            title: "Il tuo profilo atleta",
            description:
              "Qui trovi la tua firma fisiologica: curva di potenza, potenza critica (CP), riserva anaerobica (W′) e il tuo fenotipo. Viene aggiornato ogni volta che premi «Aggiorna profilo».",
            side: "top",
            align: "center",
          },
        },
        {
          element: "#tour-cp-hero",
          popover: {
            title: "Potenza critica (CP)",
            description:
              "La potenza che puoi sostenere teoricamente per molto tempo. È il numero più importante per costruire i tuoi allenamenti a zone. Più dati storici hai su Intervals, più sarà preciso.",
            side: "bottom",
            align: "center",
          },
        },
        // ── Chiusura ───────────────────────────────────────────────
        {
          popover: {
            title: "Tutto pronto",
            description:
              "Inizia sincronizzando i dati dalla dashboard, poi genera il primo piano settimanale. Se hai domande, ogni metrica ha un ⓘ con la spiegazione. Buon allenamento!",
            side: "over",
            align: "center",
          },
        },
      ],
    });

    const timer = setTimeout(() => d.drive(), 700);
    return () => clearTimeout(timer);
  }, []);

  return null;
}
