// ============================================================
//  Estado global
// ============================================================
let alunosProcessados = [];

// ============================================================
//  Elementos
// ============================================================
const inputPDF = document.getElementById('pdf-input');
const fileList = document.getElementById('file-list');
const uploadSection = document.getElementById('upload-section');
const reviewSection = document.getElementById('review-section');
const status = document.getElementById('status');
const genStatus = document.getElementById('gen-status');

// ============================================================
//  Upload de arquivos
// ============================================================
inputPDF.addEventListener('change', () => {
    fileList.innerHTML = '';
    for (const arquivo of inputPDF.files) {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.textContent = '📄 ' + arquivo.name;
        fileList.appendChild(div);
    }
});

// ============================================================
//  Processar PDF
// ============================================================
document.getElementById('process-btn').addEventListener('click', async () => {
    const arquivos = inputPDF.files;
    const trimestre = parseInt(document.getElementById('trimestre').value);

    if (arquivos.length === 0) {
        status.innerHTML = '<span class="erro">⚠️ Selecione pelo menos um PDF.</span>';
        return;
    }

    status.innerHTML = '<span class="processando">⏳ Processando...</span>';
    alunosProcessados = [];

    try {
        for (const arquivo of arquivos) {
            const alunos = await converterTextoEmAlunos(arquivo, trimestre);
            alunosProcessados.push(...alunos);
        }

        if (alunosProcessados.length === 0) {
            status.innerHTML = '<span class="erro">❌ Nenhum aluno detectado. Verifique o PDF.</span>';
            return;
        }

        const elegiveis = alunosProcessados.filter(a => a.elegivel);
        status.innerHTML = `<span class="ok">✅ ${alunosProcessados.length} alunos processados, ${elegiveis.length} elegíveis.</span>`;

        mostrarRevisao(trimestre);
    } catch (erro) {
        console.error(erro);
        status.innerHTML = `<span class="erro">❌ Erro: ${erro.message}</span>`;
    }
});

// ============================================================
//  Tela de revisão com nomes editáveis
// ============================================================
function mostrarRevisao(trimestre) {
    uploadSection.style.display = 'none';
    reviewSection.style.display = 'block';

    const elegiveis = alunosProcessados.filter(a => a.elegivel);

    document.getElementById('review-summary').innerHTML = `
        <div class="stat">
            <span class="valor">${alunosProcessados.length}</span>
            <span class="label">Total</span>
        </div>
        <div class="stat destaque">
            <span class="valor">${elegiveis.length}</span>
            <span class="label">Elegíveis</span>
        </div>
    `;

    const tbody = document.querySelector('#review-table tbody');
    tbody.innerHTML = '';

    alunosProcessados
        .sort((a, b) => a.numero - b.numero)
        .forEach((aluno, idx) => {
            const menor = aluno.notasTrimestre.length
                ? Math.min(...aluno.notasTrimestre)
                : 0;

            const tr = document.createElement('tr');
            tr.className = aluno.elegivel ? 'linha-elegivel' : 'linha-nao-elegivel';

            tr.innerHTML = `
                <td>${aluno.numero}</td>
                <td>
                    <input type="text" 
                           class="nome-editavel" 
                           value="${aluno.nome.replace(/"/g, '&quot;')}"
                           data-idx="${idx}">
                </td>
                <td>${aluno.notasTrimestre.length}/${aluno.disciplinasEsperadas.length}</td>
                <td>${menor.toFixed(1)}</td>
                <td>
                    ${aluno.elegivel
                        ? '<span class="badge badge-ok">Elegível</span>'
                        : '<span class="badge badge-no">Não</span>'}
                </td>
            `;
            tbody.appendChild(tr);
        });

    // Habilita/desabilita botão de gerar
    const btnGerar = document.getElementById('generate-btn');
    btnGerar.disabled = elegiveis.length === 0;
    btnGerar.textContent = elegiveis.length === 0
        ? '📄 Nenhum aluno elegível'
        : `📄 Gerar ${elegiveis.length} Certificado(s)`;

    // Listener para salvar edições de nome
    document.querySelectorAll('.nome-editavel').forEach(inp => {
        inp.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            alunosProcessados[idx].nome = e.target.value;
        });
    });
}

// ============================================================
//  Botão: Gerar certificados
// ============================================================
document.getElementById('generate-btn').addEventListener('click', async () => {
    const trimestre = parseInt(document.getElementById('trimestre').value);
    const elegiveis = alunosProcessados.filter(a => a.elegivel);

    if (elegiveis.length === 0) {
        alert('Nenhum aluno elegível para gerar certificados.');
        return;
    }

    const btn = document.getElementById('generate-btn');
    btn.disabled = true;
    genStatus.innerHTML = '<span class="processando">⏳ Gerando certificados...</span>';

    try {
        // Gera ZIP com todos os elegíveis
        const zip = new JSZip();

        for (let i = 0; i < elegiveis.length; i++) {
            const aluno = elegiveis[i];
            genStatus.innerHTML = `<span class="processando">⏳ Gerando ${i + 1}/${elegiveis.length}: ${aluno.nome}</span>`;

            const pdfBlob = await gerarCertificadoBlob(aluno, trimestre);
            const nomeArq = `certificado_${String(aluno.numero).padStart(2, '0')}_${aluno.nome.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '')}.pdf`;
            zip.file(nomeArq, pdfBlob);
        }

        genStatus.innerHTML = '<span class="processando">⏳ Empacotando ZIP...</span>';
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        saveAs(zipBlob, `certificados_${trimestre}trimestre.zip`);

        genStatus.innerHTML = '<span class="ok">✅ Certificados gerados com sucesso!</span>';
        btn.disabled = false;
    } catch (erro) {
        console.error(erro);
        genStatus.innerHTML = `<span class="erro">❌ Erro: ${erro.message}</span>`;
        btn.disabled = false;
    }
});

// ============================================================
//  Botão: Recomeçar
// ============================================================
document.getElementById('restart-btn').addEventListener('click', () => {
    if (!confirm('Recomeçar? Todos os dados serão perdidos.')) return;

    alunosProcessados = [];
    inputPDF.value = '';
    fileList.innerHTML = '';
    status.innerHTML = '';
    genStatus.innerHTML = '';

    reviewSection.style.display = 'none';
    uploadSection.style.display = 'block';
});
