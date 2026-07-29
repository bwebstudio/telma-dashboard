import type { CrmContactRole, CrmSpecialty } from './types'

// "Paste and split" for the new clinic form.
//
// Reps get leads as loose text on WhatsApp: "Clínica X, Dra. Fulana, Rua das
// Flores 12, 912 345 678". This does not have to be right every time, it has
// to save typing. Everything it produces is shown in normal editable fields
// before anything is saved.

export interface ParsedProspect {
  name: string
  phone: string
  address: string
  zone: string
  website: string
  specialty: CrmSpecialty | ''
  contactName: string
  contactRole: CrmContactRole | ''
  rest: string
}

const TITLES = /^(dr|dra|dr\.|dra\.|doutor|doutora|doctor|doctora|d\.|sr|sra|sr\.|sra\.)\s+/i
const RECEPTION = /(recepcionista|rece[pç][aã]o|recepci[oó]n|secretaria)/i
// Two shapes: the full word ("Rua", "Calle"), and the abbreviation that ends in
// a dot or a slash ("Av. de América", "C/ Mayor"). They need separate handling
// because \b never matches between a dot and a space.
const STREET = new RegExp(
  '^(?:' +
    '(?:rua|avenida|travessa|pra[cç]a|largo|estrada|urbaniza[cç][aã]o|calle|avda|' +
    'plaza|paseo|carrer|camino|ronda|alameda|beco|quinta)\\b' +
    '|(?:r|av|tv|estr|pç|c)\\s*[./]' +
    ')',
  'i'
)
const DENTAL = /(dent[aá]ri|dental|dentista|odonto|implant)/i
const AESTHETIC = /(est[eé]tic|aesthetic|belleza|beauty|derma|medicina est)/i
const WEB = /(https?:\/\/|www\.|[a-z0-9-]+\.(pt|es|com|net|clinic)\b)/i

// A Portuguese or Spanish phone number is 9 digits, often written with spaces
// and sometimes a +351 / +34 prefix.
const PHONE = /(\+?\d[\d\s().-]{7,})/

function digits(value: string): string {
  return value.replace(/\D/g, '')
}

// Reps mix leads and notes into the same message all the time. These two
// patterns keep a note out of a field where it would look like data.
// NOTE_SENTENCE is the narrow one: things a clinic or a person is never called.
const NOTE_SENTENCE =
  /\b(lig(ar|uei|o|ou)|chamar|volt(ar|ei)|atende|contest|ocupad|f[eé]rias|vacacion|almo[cç]o|recado|llam)/i
// NOTE_WORDS also rules out times and days, which a town name never contains.
const NOTE_WORDS = new RegExp(
  `${NOTE_SENTENCE.source}|\\b(comer|email|whats|reuni|manh[aã]|tarde|hoje|amanh[aã]|hora|ma[nñ]ana)`,
  'i'
)

const words = (value: string) => value.split(/\s+/).length

function isPlaceName(value: string): boolean {
  if (/\d/.test(value)) return false
  if (NOTE_WORDS.test(value)) return false
  return words(value) <= 4 && value.length <= 32
}

// Names are short. A long clause is a sentence somebody wrote, not a name, and
// belongs in the note rather than in a field.
const isNameish = (value: string) => words(value) <= 8 && !NOTE_SENTENCE.test(value)
const isPersonish = (value: string) => words(value) <= 6 && !NOTE_SENTENCE.test(value)

// "Dra." and "Av." end in a full stop without ending a sentence. They are
// masked before the sentence split and restored right after.
const ABBREV = /\b(dr|dra|sr|sra|prof|exmo|exma|av|avda|r|est|trav|lda|no|nº|d)\.(?=\s)/gi
const MASK = '\u0001'

function segments(raw: string): string[] {
  return raw
    .replace(ABBREV, (m) => m.replace('.', MASK))
    // Lines, list separators, and sentence ends ("... dia 3. Ligar às 10h").
    .split(/\n|[;,]|\s[-–—]\s|\.\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÑ])/)
    .map((s) =>
      s.replaceAll(MASK, '.').trim().replace(/^[·•*\-–—\s]+/, '').trim()
    )
    .filter(Boolean)
}

export function parseProspectText(raw: string): ParsedProspect {
  const out: ParsedProspect = {
    name: '',
    phone: '',
    address: '',
    zone: '',
    website: '',
    specialty: '',
    contactName: '',
    contactRole: '',
    rest: '',
  }
  if (!raw.trim()) return out

  const leftovers: string[] = []

  for (const seg of segments(raw)) {
    // Phone: take the longest run of digits in the segment.
    const phoneMatch = seg.match(PHONE)
    if (!out.phone && phoneMatch && digits(phoneMatch[1]).length >= 9) {
      out.phone = phoneMatch[1].trim()
      const remainder = seg.replace(phoneMatch[1], '').trim()
      if (!remainder) continue
      // The segment carried more than a number, keep looking at the rest.
      if (RECEPTION.test(remainder) || TITLES.test(remainder)) {
        if (!out.contactName) {
          out.contactName = remainder.replace(TITLES, '').trim()
          out.contactRole = RECEPTION.test(remainder) ? 'reception' : 'doctor'
        }
        continue
      }
      leftovers.push(remainder)
      continue
    }

    if (!out.website && WEB.test(seg) && !STREET.test(seg)) {
      out.website = seg.replace(/^site:?\s*/i, '').trim()
      continue
    }

    if (!out.contactName && (TITLES.test(seg) || RECEPTION.test(seg)) && isPersonish(seg)) {
      out.contactRole = RECEPTION.test(seg) ? 'reception' : 'doctor'
      out.contactName = seg.replace(TITLES, '').replace(RECEPTION, '').replace(/[()]/g, '').trim()
      continue
    }

    if (!out.address && STREET.test(seg)) {
      out.address = seg
      continue
    }

    // A sentence about a call is never the clinic's name. Better to leave the
    // field empty for the rep to fill than to save something wrong.
    if (!out.name && isNameish(seg)) {
      out.name = seg
      if (DENTAL.test(seg)) out.specialty = 'dental'
      else if (AESTHETIC.test(seg)) out.specialty = 'aesthetic'
      continue
    }

    leftovers.push(seg)
  }

  if (!out.specialty) {
    if (DENTAL.test(raw)) out.specialty = 'dental'
    else if (AESTHETIC.test(raw)) out.specialty = 'aesthetic'
  }

  // A leftover that reads like a place name becomes the area. Anything that
  // reads like a note ("liguei 2x", "ligar às 12h50") is kept in "rest" and
  // becomes the first activity note, so no part of the message is lost.
  const zoneIndex = leftovers.findIndex(isPlaceName)
  if (zoneIndex >= 0) out.zone = leftovers.splice(zoneIndex, 1)[0]
  out.rest = leftovers.join(' · ')

  if (!out.name && out.contactName) out.name = out.contactName

  return out
}
