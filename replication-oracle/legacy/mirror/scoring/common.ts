// Shim de resolução: o blob histórico importa `buildBaseResult` daqui.
// Reexporta a função REAL de produção. `buildBaseResult` não é objeto da
// replicação AG-01 (só as métricas custom do Corsi são comparadas), e sua
// assinatura é idêntica nos dois períodos (verificado no diff 478a8fb).
export * from '../../../../src/scoring/common'
