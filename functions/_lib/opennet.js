// 0182: shared by /r/<short> and /r/ok. IPv4 → first three parts (/24), IPv6 → first three groups (/48).
export const ipRange = (ip) => (String(ip).includes(':') ? String(ip).split(':').slice(0, 3).join(':') : String(ip).split('.').slice(0, 3).join('.'));
