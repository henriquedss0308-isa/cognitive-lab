// Shim de resolução para executar o blob histórico sem alterá-lo.
// Reexporta os tipos ATUAIS de produção (imports de tipo são apagados na
// transpilação; nenhum valor de produção é modificado).
export * from '../../../../src/types'
