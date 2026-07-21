# Verificação de fontes — revisão adversarial GPT-5.6

Data da verificação: 2026-07-21. Versão examinada: `v1.2.0-pre-validation`
(`05ef727b4826ea92193ec0e2add40cd662eb1906`). Esta verificação separa a
existência bibliográfica do alcance lógico da fonte. “Suporte parcial” significa
que o artigo sustenta uma premissa, mas não a aplicação específica feita ao
Cognitive Lab.

## Resultado resumido

Os DOI/PMID centrais existem. O problema principal não é fabricação de
referências, e sim extrapolação: estudos de paradigma, psicometria populacional
ou plataformas web diferentes foram usados algumas vezes como se validassem o
protocolo e a implementação locais. Nenhuma das fontes revisadas demonstra, por
si só, validade longitudinal individual do Cognitive Lab.

| Fonte citada | Existência | Afirmação atribuída na auditoria | Suporte real | Limitações e contrapontos |
|---|---|---|---|---|
| Hautus (1995), [doi:10.3758/BF03203619](https://doi.org/10.3758/BF03203619) | Confirmada | A correção log-linear adiciona 0,5 às quatro células e evita infinitos nas taxas extremas. | **Direto.** O artigo compara a regra `1/(2N)` à regra log-linear e encontra menor viés para esta última; ela subestima o d′ populacional. | Sustenta a fórmula quando a tabela 2×2 está corretamente definida. Não sustenta a exclusão assimétrica de antecipações encontrada em AG-03, nem valida a escolha do d′ como marcador longitudinal neste protocolo. |
| Rousseeuw & Croux (1993), [doi:10.1080/01621459.1993.10476408](https://doi.org/10.1080/01621459.1993.10476408) | Confirmada | `1,4826 × MAD` é uma escala robusta comparável ao desvio-padrão sob normalidade. | **Direto para o estimador de escala.** O artigo descreve o MAD normalizado e suas propriedades de robustez. | Não valida janela de oito sessões, corte `n ≥ 6`, interpretação clínica de z ou pressuposto de estacionariedade de uma série pessoal. |
| Leys et al. (2013), [doi:10.1016/j.jesp.2013.03.013](https://doi.org/10.1016/j.jesp.2013.03.013) | Confirmada | MAD deve ser preferido ao desvio-padrão para detectar outliers. | **Direto para detecção de outliers.** | A auditoria o usa também como apoio geral ao baseline longitudinal; essa extrapolação é apenas uma escolha metodológica, não um resultado do artigo. |
| Robertson et al. (1997), PMID [9204482](https://pubmed.ncbi.nlm.nih.gov/9204482/), [doi:10.1016/S0028-3932(97)00015-8](https://doi.org/10.1016/S0028-3932(97)00015-8) | Confirmada | O SART original tem 225 ensaios contínuos, dígito por 250 ms, máscara por 900 ms e cinco tamanhos de fonte aleatórios. | **Direto.** O protocolo publicado contém esses elementos e alvos raros de um em nove. | Confirma que a implementação local é uma variante (252 ensaios, seis blocos, tamanho fixo), mas não prova que a variante seja inválida. Proíbe inferir equivalência normativa sem estudo de equivalência. |
| Kessels et al. (2000), PMID [11296689](https://pubmed.ncbi.nlm.nih.gov/11296689/), [doi:10.1207/S15324826AN0704_8](https://doi.org/10.1207/S15324826AN0704_8) | Confirmada | Há procedimento padronizado para Corsi, com duas tentativas por comprimento e span baseado no maior comprimento reproduzido. | **Direto para a padronização;** descrições metodológicas posteriores explicitam avanço com ao menos um acerto e parada após duas falhas. | O protocolo local usa regra adaptativa própria. Berch et al. já documentavam forte variabilidade de administração e scoring; portanto “canônico” não significa que toda variante seja errada, apenas que normas não são transferíveis. |
| Berch, Krikorian & Huha (1998), [doi:10.1006/brcg.1998.1039](https://doi.org/10.1006/brcg.1998.1039) | Confirmada | — fonte contraditória procurada nesta revisão. | **Contraponto direto.** A revisão relata inconsistência considerável na administração, scoring e aparato do Corsi. | Enfraquece uma leitura binária de AC-09. Ao mesmo tempo, reforça que parâmetros diferentes impedem comparação normativa simples. |
| Rogers & Monsell (1995), [doi:10.1037/0096-3445.124.2.207](https://doi.org/10.1037/0096-3445.124.2.207) | Confirmada | Define custos de alternância pela diferença entre trials switch e nonswitch em paradigma previsível. | **Direto para o fenômeno e os contrastes de RT/erro.** | A fonte sustenta o contraste, mas a alegação específica de que a implementação local deve excluir todo primeiro trial de bloco não ficou demonstrada apenas pelo resumo bibliográfico. AC-13 é sustentado primariamente pela classificação logicamente incorreta no código, não por autoridade bibliográfica. A literatura não fixa uma única orientação de sinal para uma diferença expressa em acurácia; a convenção precisa ser declarada. |
| Hedge, Powell & Sumner (2018), PMID [28726177](https://pubmed.ncbi.nlm.nih.gov/28726177/), PMCID [PMC5990556](https://pmc.ncbi.nlm.nih.gov/articles/PMC5990556/), [doi:10.3758/s13428-017-0935-1](https://doi.org/10.3758/s13428-017-0935-1) | Confirmada | Escores de diferença, inclusive custo Stroop, podem ter confiabilidade individual menor que seus componentes. | **Direto.** O artigo mostra o “paradoxo da confiabilidade” e discute a perda de sinal em subtrações; os ICCs de custo Stroop são moderados no desenho estudado. | É evidência populacional e entre indivíduos. Não estima a confiabilidade do protocolo local nem decide a utilidade de uma série intraindividual; para isso é necessário teste–reteste local. |
| Bridges et al. (2020), [doi:10.7717/peerj.9414](https://doi.org/10.7717/peerj.9414) | Confirmada | Experimentos web podem alcançar precisão de RT inferior a 10 ms, mas variam por plataforma, navegador e hardware; a configuração real deve ser medida. | **Direto.** Mais de 110 mil trials foram medidos com hardware externo. | Não mediu o Cognitive Lab. Não autoriza transportar um viés de “aproximadamente um frame” para AC-05 nem garante a duração local de estímulos; ao contrário, exige validação da configuração específica. |
| Anwyl-Irvine et al. (2021), [doi:10.3758/s13428-020-01501-5](https://doi.org/10.3758/s13428-020-01501-5) | Confirmada | Precisão/acurácia de plataformas, navegadores e dispositivos web é mensurável e heterogênea. | **Direto para as plataformas testadas.** | Também não testou este código. Sustenta a exigência de fotodiodo/atuador, não uma estimativa exata de erro local. |
| Owen et al. (2005), PMID [15846822](https://pubmed.ncbi.nlm.nih.gov/15846822/), PMCID [PMC6871745](https://pmc.ncbi.nlm.nih.gov/articles/PMC6871745/), [doi:10.1002/hbm.20131](https://doi.org/10.1002/hbm.20131) | Confirmada | N-back é paradigma consolidado de memória de trabalho. | **Parcial.** É uma meta-análise de neuroimagem que mostra recrutamento consistente de redes durante variantes de n-back. | Ativação convergente não é validade de construto de um escore individual, nem confiabilidade teste–reteste, nem validação do n-back espacial local. |
| Jaeggi et al. (2010), [doi:10.1080/09658211003702171](https://doi.org/10.1080/09658211003702171) | Confirmada | A validade convergente do n-back como medida individual de memória de trabalho é limitada. | **Direto e mais forte que a formulação suave da auditoria.** O artigo conclui que n-back não foi medida útil de diferenças individuais em MT, em parte por confiabilidade insuficiente, embora seja útil experimentalmente. | Não implica que toda mudança intraindividual em d′ seja ruído; exige estudo local de confiabilidade, aprendizagem e validade convergente. |
| Silverstein et al. (2019), PMCID [PMC6889798](https://pmc.ncbi.nlm.nih.gov/articles/PMC6889798/) | Confirmada | d′ de 2-back pode ter propriedades psicométricas razoáveis. | **Parcial e contextual.** No ensaio de cognição em esquizofrenia, o d′ 2-back teve a melhor combinação entre variáveis n-back e ICC aproximadamente moderado; houve também efeito de aprendizagem. | População, protocolo e finalidade diferem. O número de trials isoladamente não permite afirmar confiabilidade do d′ local; a auditoria acertou ao pedir validação empírica, mas não poderia inferir confiabilidade apenas do desenho. |
| Indexed Database API 3.0, [W3C](https://www.w3.org/TR/IndexedDB/), e ECMAScript 2019, [ECMA-262 10ª ed.](https://ecma-international.org/wp-content/uploads/ECMA-262_10th_edition_june_2019.pdf) | Confirmadas | — documentação técnica usada nesta revisão para AC-15. | **Direto.** `getAll()` percorre o object store em ordem de chave; desde ES2019 `Array.prototype.sort` deve ser estável. | No caminho atual, essas duas garantias preservam a ordem de empate e refutam a alegada troca arbitrária entre leituras. Um desempate explícito ainda seria documentação defensiva, mas não um bug reprodutível. |

## Inferências que a literatura não autoriza

- Nenhuma fonte converte aprovação de testes unitários ou equivalência entre
  duas implementações em validade psicométrica.
- Bridges e Anwyl-Irvine justificam medir timing real; não medem AC-05/AC-14.
- Rousseeuw–Croux e Leys justificam robustez matemática; não validam a janela,
  os limiares ou o significado decisório do z pessoal.
- Owen demonstra uso neurocientífico do n-back, enquanto Jaeggi põe limite
  explícito à interpretação de diferenças individuais. As duas fontes são
  compatíveis quando seus objetos são distinguidos.
- A ausência de estudo local não prova inadequação. Ela impede a afirmação
  forte de que o instrumento já é “defensável” para decisões individuais.

## Conclusão bibliográfica

As referências centrais são reais e, em geral, foram citadas de boa-fé. O grau
de suporte é: direto para Hautus, propriedades do MAD, diferenças estruturais do
SART e a cautela com escores de diferença; parcial para validade longitudinal,
timing desta aplicação e confiabilidade do n-back local. A evidência disponível
apoia limitações e um plano de validação, não a validação concluída do produto.
