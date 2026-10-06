// Configura o worker do PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ============================================================
//  Extrai o texto completo de um PDF
// ============================================================
async function extrairTextoPDF(arquivo) {
    const buffer = await arquivo.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    let textoCompleto = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const pagina = await pdf.getPage(i);
        const conteudo = await pagina.getTextContent();

        // Agrupa por linha (por coordenada Y)
        const linhas = {};
        conteudo.items.forEach(item => {
            const y = Math.round(item.transform[5]);
            if (!linhas[y]) linhas[y] = [];
            linhas[y].push({ x: item.transform[4], texto: item.str });
        });

        // Ordena linhas de cima para baixo
        const ys = Object.keys(linhas).map(Number).sort((a, b) => b - a);
        ys.forEach(y => {
            linhas[y]
                .sort((a, b) => a.x - b.x)
                .forEach(celula => { textoCompleto += celula.texto + ' '; });
            textoCompleto += '\n';
        });
    }
    return textoCompleto;
}

// ============================================================
//  Converte texto em lista de alunos com notas
//  (ajuste conforme o layout real do PDF da escola)
// ============================================================
function converterTextoEmAlunos(texto, trimestre) {
    const linhas = texto.split('\n').filter(l => l.trim());
    const alunos = [];
    let turmaAtual = null;

    for (const linha of linhas) {
        // Detecta linha de turma (ex: "6ª Ano A")
        const matchTurma = linha.match(/(\d+)[ªº]\s*Ano\s*([A-Z])/i);
        if (matchTurma) {
            turmaAtual = {
                serie: matchTurma[1] + 'º ANO',
                letra: matchTurma[2].toUpperCase()
            };
            continue;
        }

        // Detecta linha de aluno (número + nome)
        const matchAluno = linha.match(/^(\d+)\s+([A-ZÀ-Ú][A-ZÀ-Ú\s]+)/);
        if (matchAluno && turmaAtual) {
            const numero = parseInt(matchAluno[1]);
            const nome = matchAluno[2].trim();

            // Extrai as notas (números decimais) da linha
            const notas = [...linha.matchAll(/(\d{1,2}[.,]\d)/g)]
                .map(m => parseFloat(m[1].replace(',', '.')));

            if (notas.length > 0) {
                alunos.push({
                    numero,
                    nome,
                    turma: turmaAtual,
                    notas,
                    media: notas.reduce((a, b) => a + b, 0) / notas.length,
                    elegivel: notas.every(n => n >= CONFIG.notaMinima)
                });
            }
        }
    }
    return alunos;
}
