# n8n-nodes-dakoty (slovensky)

Komunitné uzly [n8n](https://n8n.io) pre [Dakoty CRM](https://dakoty.com): čítaj a zapisuj leady, firmy,
kontakty, aktivity, úlohy, faktúry a rezervácie a spúšťaj workflow hneď, ako sa v Dakoty niečo stane.

English version: [README.md](README.md). Názvy v n8n sú v angličtine, tu sú uvedené tak, ako ich uvidíš na
obrazovke.

- Uzol **Dakoty**: 33 operácií v 7 zdrojoch, rovnaký rozsah ako aplikácia Dakoty pre Make.
- Uzol **Dakoty Trigger**: okamžité spúšťače cez REST hooky Dakoty s overením podpisu.
- Prístupové údaje **Dakoty API**: jeden API kľúč.
- Bez runtime závislostí, licencia MIT.

## Inštalácia

Vlastný (self-hosted) n8n: **Settings → Community nodes → Install**, napíš `n8n-nodes-dakoty`, potvrď
upozornenie a nainštaluj.

n8n Cloud: uzly sa v paneli objavia po tom, čo ich n8n overí. Dovtedy použi uzol *HTTP Request* s
prístupovými údajmi *Header Auth* (`Authorization: Bearer dk_live_…`) a adresou
`https://api.dakoty.com/api/v1/public`.

## Prístupové údaje

1. V Dakoty otvor **Nastavenia organizácie → Integrácie → API kľúče** a vytvor kľúč. Predvoľba
   **Make / Zapier / n8n – bežné použitie** pokryje všetko okrem zápisu faktúr a rezervácií; ak ich
   potrebuješ, pridaj *Faktúry – zapisovať* a *Rezervácie – zapisovať*.
2. V n8n vytvor prístupové údaje **Dakoty API** a vlož kľúč (začína `dk_live_`).
3. **Base URL** nechaj `https://api.dakoty.com/api/v1/public` (mení sa len pri skúšaní proti lokálnej
   Dakoty).
4. Ulož. n8n údaje overí volaním `GET /me`; pri zlom kľúči ukáže hlášku 401 z API.

## Operácie

| Zdroj | Operácie |
|---|---|
| Lead | Create, Update, Get, Get Many, Find, Archive, Move to Stage |
| Company | Create, Update, Get, Get Many, Find |
| Contact | Create, Update, Get, Get Many, Find |
| Activity | Create, Update, Get, Get Many, Complete |
| Task | Create, Update, Get, Get Many |
| Invoice | Create, Get, Get Many |
| Booking | Create, Get, Get Many, Cancel |

- **Get Many**: *Return All* prejde všetky stránky, *Limit* vráti najviac 1 až 100 záznamov. K tomu filtre
  (*Created After*, *Updated Since*, *Sort By* a filtre konkrétneho zdroja).
- **Find** hľadá presnú zhodu (e-mail, IČO, telefón, číslo faktúry …); keď nič nenájde, nevráti výsledok.
  Vyplň aspoň jedno pole.
- **Create Lead** vie firmu a kontakt vytvoriť alebo priradiť v tom istom kroku (polia *Company: …* a *Contact: …*); *Duplicate Check = Company* vráti existujúci aktívny lead tej istej firmy namiesto druhého (výstup má vtedy `deduplicated: true`).
- Zápisy majú voliteľný **Idempotency Key** (v *Additional Fields*): opakované poslanie
  s rovnakým kľúčom vráti uložený výsledok namiesto duplicity.
- Chyby obsahujú správu z API a popis ako `[403] FORBIDDEN`. Pri HTTP 429 zapni v nastaveniach uzla
  *Retry On Fail*.

## Dakoty Trigger

Spustí workflow, keď v Dakoty nastane vybraná udalosť (**Events**, na výber je 41 udalostí).

- Po zapnutí workflow uzol v Dakoty vytvorí REST hook s názvom `n8n – <názov workflow>`; po vypnutí alebo
  zmazaní workflow ho zmaže. Nič nekopíruješ.
- **Output**: *Simplified* (predvolené) vráti polia záznamu plus `event_id`, `event_type`, `occurred_at`,
  `organization`, `test`. *Raw* vráti celú obálku, záznam je v `data`.
- **Verify Signature** (predvolene zapnuté) overí hlavičky Standard Webhooks (`webhook-id`,
  `webhook-timestamp`, `webhook-signature`). Požiadavka s chybným podpisom dostane `401` a workflow sa nespustí.
- Adresa webhooku n8n musí byť dostupná z internetu cez https. `localhost` a adresy z vnútornej siete
  Dakoty odmietne.

## Oprávnenia API kľúča

| Oprávnenie | Na čo |
|---|---|
| `leads:read` / `leads:write` | Lead; zoznamy pôvod, pipeline, fáza, dôvod straty |
| `companies:read` / `companies:write` | Firmy a kontakty |
| `activities:read` / `activities:write` | Aktivity, zoznam typov aktivít |
| `tasks:read` / `tasks:write` | Úlohy, zoznamy projektov a fáz |
| `invoices:read` / `invoices:write` | Faktúry |
| `bookings:read` / `bookings:write` | Rezervácie, zoznamy služieb a personálu |
| `users:read` | Zoznamy vlastníkov a riešiteľov |
| `webhooks:manage` | Dakoty Trigger (a čítacie oprávnenie každej vybranej entity) |

Chýbajúce oprávnenie vráti `403 FORBIDDEN` s názvom oprávnenia v správe.

## Vývoj

Pozri [README.md](README.md#development). Licencia [MIT](LICENSE).
