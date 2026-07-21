# Fixtures sintéticas

Os testes constroem backups oficiais `version: 1.0.0` inteiramente sintéticos
com as fábricas de `tests/synthetic_fixtures.py`. Os cenários cobertos são:

1. nenhuma sessão Corsi;
2. apenas sessões legacy;
3. apenas sessões current;
4. legacy e current fora da janela congelada;
5. legacy e current dentro da janela;
6. `scoringVersion` ausente;
7. trials incompletos;
8. sessão malformada;
9. resultado persistido divergente;
10. input e output iguais;
11. output dentro do repositório;
12. hash idêntico antes/depois.

As mesmas fábricas também exercitam scorings diferentes sob a mesma
`protocolVersion`, divergência de `confirmedSpan`/`maxSpan`, familiarização,
sessão inválida e janela com menos de `MIN_BASELINE_N`. Nenhuma fixture contém
dados copiados de usuário, backup real ou identificadores reais.
