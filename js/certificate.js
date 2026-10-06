// ============================================================
//  Preenche o template HTML com os dados do aluno
// ============================================================
function preencherTemplate(aluno, trimestre) {
    document.getElementById('cert-nome').textContent = aluno.nome;
    document.getElementById('cert-serie').textContent =
        aluno.turma.descricao || (aluno.turma.serie + ' DO ENSINO FUNDAMENTAL');
    document.getElementById('cert-letra').textContent = aluno.turma.letra;
    document.getElementById('cert-trimestre').textContent = trimestre + 'º';
    document.getElementById('cert-ano').textContent = CONFIG.anoLetivo;
    document.getElementById('cert-data').textContent =
        `${CONFIG.cidade}, ${CONFIG.datasTrimestres[trimestre]}`;
}

// ============================================================
//  Gera 1 PDF do certificado (A4 paisagem)
// ============================================================
async function gerarCertificadoPDF(aluno, trimestre) {
    preencherTemplate(aluno, trimestre);

    // Aguarda fontes carregarem
    if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
    }

    const elemento = document.getElementById('cert-render');

    const canvas = await html2canvas(elemento, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const { jsPDF } = window.jspdf;

    // A4 paisagem em pixels: 842 x 595
    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [842, 595]
    });

    doc.addImage(imgData, 'JPEG', 0, 0, 842, 595);
    return doc;
}

// ============================================================
//  Gera todos os certificados em um ZIP
// ============================================================
async function gerarTodosCertificados(alunos, trimestre, callbackProgresso) {
    const zip = new JSZip();
    const total = alunos.length;

    for (let i = 0; i < total; i++) {
        const aluno = alunos[i];
        const doc = await gerarCertificadoPDF(aluno, trimestre);
        const blob = doc.output('blob');

        const nomeArquivo = `certificado_${String(aluno.numero).padStart(2, '0')}_${aluno.nome.replace(/\s+/g, '_')}.pdf`;
        zip.file(nomeArquivo, blob);

        if (callbackProgresso) callbackProgresso(i + 1, total);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    saveAs(zipBlob, `certificados_${trimestre}trimestre_${Date.now()}.zip`);
}
