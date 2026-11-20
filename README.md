# DSH Agent Tiers

Vier fertige Agent-Stufen für **DeepSeek Harness Desktop**, damit du nichts selbst einstellen musst. Wähle die passende Stufe einfach in der Sitzungsauswahl.

| Stufe | Ordner | Inhalt |
|---|---|---|
| **Creator** | `tiers/creator` | Offizieller Creator-Modus: Der Agent passt DSH für dich an (Plugins, Modi, Oberfläche). |
| **Coding Extra Tools** | `tiers/coding-extra` | Alle Standard-Werkzeuge: Web, Subagenten, Workflows, Office, Zeitplan, Plugin-Verwaltung. |
| **Coding Normal** | `tiers/coding-normal` | Standard ohne Web, Zeitplan, Plugin-Verwaltung und Plugin-Marktplatz. |
| **Coding Minimal** | `tiers/coding-minimal` | Nur Terminal, Dateien lesen/schreiben/suchen, Todo-Liste und Rückfragen. Dazu Projektanweisungen (`AGENTS.md`) und Kontext-Komprimierung, damit lange Sitzungen nicht abbrechen. |

Das Plugin enthält keinen Code, der in DSH läuft. Jede Stufe ist ein offizieller `@deepseek-ai/dsh-agent-preset`-Eintrag mit eigener ID (`tier-creator`, `tier-coding-extra`, `tier-coding-normal`, `tier-coding-minimal`). Die Einträge werden 1:1 aus den offiziellen Presets „Standard“ bzw. „Creator“ der installierten DSH-Version übernommen. An bestehenden Einträgen ändert das Plugin nichts.

## Installation

```powershell
dsh plugin --profile desktop add github:Dizzle-code/dsh-agent-tiers
```

Danach DSH neu starten. Voraussetzung: Der Befehl `dsh` ist eingerichtet (DSH Desktop → Menü „Manage dsh Command“).

## Benutzen

- **Pro Sitzung:** Beim Anlegen einer neuen Aufgabe die Stufe in der Auswahl „Wählen Sie die Agentenvoreinstellung für Ihre neue Aufgabe“ wählen.
- **Als Standard:** Einstellungen → **Agentenvoreinstellungen** → bei der Stufe **„Als Standard für neue Aufgabe festlegen“**.

> [!IMPORTANT]
> Wenn du vorher **DSH Custom Mode** benutzt und wieder entfernt hast, zeigt dein Standard eventuell noch auf das Preset `custom`, das es dann nicht mehr gibt. Lege in dem Fall eine dieser Stufen als Standard fest.

## Deinstallation

```powershell
dsh plugin --profile desktop remove dsh-agent-tiers
```

War eine Stufe dein Standard, lege vorher ein anderes Preset als Standard fest.

## Kompatibilität

Geprüft mit **DeepSeek Harness 0.2.2-rc.3 und 0.2.2-rc.5** (Windows). `engines.dsh` erlaubt genau diese beiden Versionen. Bei anderen Versionen überspringt DSH das Plugin beim Start, und die Stufen fehlen in der Auswahl. DSH selbst startet normal.

Was die Prüfung abdeckt: die Zusammensetzung der Konfiguration mit dem echten DSH-Loader. Nicht geprüft ist ein vollständiger Start einer Sitzung mit jeder Stufe.

## Für Entwickler

Voraussetzung: Node.js 22.18 oder neuer. Beide Skripte starten sich in der DSH-eigenen Laufzeit neu (`DeepSeek Harness.exe` mit `ELECTRON_RUN_AS_NODE=1`). Ein anderes DSH-Programm wählst du mit `--dsh <Pfad>` oder `DSH_EXE`.

- **Stufe ändern:** `scripts/tiers.ts` anpassen, dann `npm run generate`. Die Dateien in `tiers/` werden erzeugt; nicht von Hand bearbeiten.
- **Prüfen:** `npm run check`. Weitere Builds prüfst du mit `npm run check -- --target <app.asar>`; sie werden nur als Daten gelesen. Die Prüfung stellt sicher, dass:
  - jede Stufe noch exakt den offiziellen Einträgen der geprüften Version entspricht;
  - die Preset-IDs eindeutig sind und kein bestehender Eintrag verändert wird;
  - jedes verwendete Paket in der DSH-Version existiert;
  - der Loader keine Warnungen ausgibt und `engines.dsh` passt;
  - ein echter `dsh --dump-config`-Lauf mit einem Wegwerf-Profil in einem temporären `DSH_HOME` das Plugin annimmt. Dein `~/.dsh` wird nicht verändert.

## Lizenz

MIT
