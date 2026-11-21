import { describe, expect, it } from 'vitest';
import { checkDigit, faceOf, findMrz, nameMatch, verdict } from './travellercheck';

const ICAO = ['PASSPORT', 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<', 'L898902C36UTO7408122F1204159ZE184226B<<<<<10'];

describe('MRZ', () => {
  it('check digit (ICAO example)', () => { expect(checkDigit('L898902C3')).toBe(6); expect(checkDigit('740812')).toBe(2); });
  it('ICAO specimen parses', () => {
    const m = findMrz(ICAO)!;
    expect(m.issuing).toBe('UTO'); expect(m.nationality).toBe('UTO'); expect(m.surname).toBe('ERIKSSON'); expect(m.given).toEqual(['ANNA', 'MARIA']); expect(m.valid).toBe(true);
  });
  it('OCR spaces and « chevrons, Germany D<<', () => {
    const m = findMrz(['P<D<<MUSTERMANN<<ERIKA<<<<<<<<<<<<<<<<<<<<<<<'.replace(/<<<</g, '« «<'), 'C01X00T478D<<6408125F2702283<<<<<<<<<<<<<<<4'])!;
    expect(m.issuing).toBe('DEU'); expect(m.nationality).toBe('DEU'); expect(m.surname).toBe('MUSTERMANN'); expect(m.given[0]).toBe('ERIKA');
  });
  it('Norwegian specimen (public domain)', () => {
    const m = findMrz(['P<NOROESTENBYEN<<AASAMUND<SPECIMEN<<<<<<<<<<<', 'CCC002251 4NOR5604230M3004157<<<<<<<<<<<<<<04'])!;
    expect(m.nationality).toBe('NOR'); expect(m.surname).toBe('OESTENBYEN'); expect(m.valid).toBe(true);
  });
  it('Rekognition output of the specimen (tails cut, split lines)', () => {
    const m = findMrz(['INNLANDET POLITIDISTRIKT', 'P<NOROESTENBYEN<<AASAMUND<SPECIMEN<<<<', '<<', 'CCC0022514NOR5604230M3004157<<<<<<<<', ':<<04'])!;
    expect(m.issuing).toBe('NOR'); expect(m.nationality).toBe('NOR'); expect(m.given).toEqual(['AASAMUND', 'SPECIMEN']); expect(m.valid).toBe(true);
  });
  it('the printed words PASSPORT / P / NOR alone are not an MRZ', () => { expect(findMrz(['PASSPORT', 'P', 'NOR', 'CCC002251', 'OSTENBYEN'])).toBeNull(); });
  it('Thai passport', () => {
    const m = findMrz(['P<THASOMCHAI<<NIRAN<<<<<<<<<<<<<<<<<<<<<<<<<<', 'AA12345674THA9001011M3001017<<<<<<<<<<<<<<00'])!;
    expect(m.nationality).toBe('THA');
  });
  it('a selfie / ID card has no passport MRZ', () => {
    expect(findMrz(['KRING', 'hello'])).toBeNull();
    expect(findMrz(['IDUTOD231458907<<<<<<<<<<<<<<<', '7408122F1204159UTO<<<<<<<<<<<6', 'ERIKSSON<<ANNA<MARIA<<<<<<<<<<'])).toBeNull();
  });
});

describe('name', () => {
  it('match ignoring case and accents', () => { expect(nameMatch('Anna', 'MUELLER', ['ANNA'])).toBe('match'); expect(nameMatch('Müller', 'MUELLER', ['ANNA'])).toBe('match'); expect(nameMatch('José', 'GARCIA', ['JOSE'])).toBe('match'); expect(nameMatch('Åsamund', 'OESTENBYEN', ['AASAMUND', 'SPECIMEN'])).toBe('match'); });
  it('short form / typo = close', () => { expect(nameMatch('Alex', 'SMITH', ['ALEXANDER'])).toBe('close'); expect(nameMatch('Jonh', 'DOE', ['JOHN'])).toBe('close'); });
  it('Thai nickname vs Latin', () => { expect(nameMatch('มิ้นท์', 'SMITH', ['JANE'])).toBe('thai_script'); });
  it('different', () => { expect(nameMatch('Marcus', 'ERIKSSON', ['ANNA'])).toBe('differs'); });
});

describe('face + verdict', () => {
  it('face results', () => {
    expect(faceOf({ FaceMatches: [{ Similarity: 97.24 }] })).toEqual({ result: 'ok', sim: 97.2 });
    expect(faceOf({ FaceMatches: [{ Similarity: 12 }] }).result).toBe('different');
    expect(faceOf({ FaceMatches: [], UnmatchedFaces: [{}] }).result).toBe('different');
    expect(faceOf({ FaceMatches: [], UnmatchedFaces: [] }).result).toBe('no_face_passport');
  });
  it('verdicts', () => {
    expect(verdict({ mrz: false, thai: false, face: 'skipped', name: 'unknown', errors: [] })).toEqual({ suggestion: 'fail', fail_code: 'not_passport' });
    expect(verdict({ mrz: false, thai: false, face: 'skipped', name: 'unknown', errors: ['ocr'] }).suggestion).toBe('check');
    expect(verdict({ mrz: true, thai: true, face: 'ok', name: 'match', errors: [] }).fail_code).toBe('thai');
    expect(verdict({ mrz: true, thai: false, face: 'different', name: 'match', errors: [] }).fail_code).toBe('photo');
    expect(verdict({ mrz: true, thai: false, face: 'ok', name: 'thai_script', errors: [] }).suggestion).toBe('check');
    expect(verdict({ mrz: true, thai: false, face: 'ok', name: 'close', errors: [] }).suggestion).toBe('pass');
  });
});
