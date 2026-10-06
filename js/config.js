// ============================================================
//  CONFIGURAÇÕES DO SISTEMA
//  Altere aqui quando mudar direção, datas ou dados da escola
// ============================================================

const CONFIG = {
    // 🏫 Escola
    nomeEscola: "COLÉGIO ESTADUAL CÍVICO-MILITAR ANCHIETA",
    cidade: "CRUZEIRO DO OESTE",
    anoLetivo: 2026,

    // 📅 Datas de emissão por trimestre
    datasTrimestres: {
        1: "03 DE JULHO DE 2026",
        2: "25 DE SETEMBRO DE 2026",
        3: "18 DE DEZEMBRO DE 2026"
    },

    // ✍️ Assinaturas
    assinatura1: {
        nome: "CAMILA C. GABELONI FELIPE",
        cargo: "DIRETORA GERAL"
    },
    assinatura2: {
        nome: "RICHARDSON RODRIGUES",
        cargo: "COORDENADOR CÍVICO-MILITAR"
    },

    // 📊 Regra de elegibilidade
    notaMinima: 8.0,

    // 📚 Disciplinas (na ordem das colunas do PDF)
    disciplinas: [
        "ARTE", "CIENCIAS", "ED DIG COMP", "EDUCACAO FIS", "ENSINO RELIG",
        "GEOGRAFIA", "HISTORIA", "LINGUA INGLE", "LINGUA PORTU",
        "MATEMATICA", "CIDADANIA E", "EDUCACAO FIN", "LEITURA REC",
        "LINGUA ESPAN", "REC APREND M"
    ]
};
