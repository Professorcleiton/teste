// ============================================================
//  Estado global
// ============================================================
let alunosProcessados = [];
let elegiveisList = [];
let previewIndexAtual = 0;

// ============================================================
//  Elementos
// ============================================================
const inputPDF = document.getElementById('pdf-input');
const fileList = document.getElementById('file-list');
const uploadSection = document.getElementById('upload-section');
const reviewSection = document.getElementById('review-section');
const status = document.getElementById('status');
const genStatus = document.getElementById('gen-status');

const modal = document.getElementById('preview-modal');
const modalTitle = document.getElementById('preview-title');
const previewContainer = document.getElementById('preview-container');
const previewPrev = document.getElementById('preview-prev');
const previewNext = document.getElementById('preview-next');
const previewCounter = document.getElementById('preview-counter');
const downloadCurrentBtn = document.getElementById('download-current');

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

        elegiveisList = alunosProcessados.filter(a => a.elegivel);
        status.innerHTML = `<span class="ok">✅ ${alunosProcessados.length} alunos processados, ${elegiveisList.length} elegíveis.</span>`;

        mostrarRevisao(trimestre);
    } catch (erro) {
        console.error(erro);
        status.innerHTML = `<span class="erro">❌ Erro: ${erro.message}</span>`;
    }
});

// ============================================================
//  Tela de revisão
// ============================================================
function mostrarRevisao(trimestre) {
    uploadSection.style.display = 'none';
    reviewSection.style.display = 'block';

    document.getElementById('review-summary').innerHTML = `
        <div class="stat">
            <span class="valor">${alunosProcessados.length}</span>
            <span class="label">Total</span>
        </div>
        <div class="stat destaque">
            <span class="valor">${elegiveisList.length}</span>
            <span class="label">Elegíveis</span>
        </div>
    `;

    const tbody = document.querySelector('#review-table tbody');
    tbody.innerHTML = '';

    // Ordena por número
    alunosProcessados.sort((a, b) => a.numero - b.numero);

    alunosProcessados.forEach((aluno, idx) => {
        const menor = aluno.notasTrimestre.length
            ? Math.min.apply(null, aluno.notasTrimestre)
            : 0;

        const tr = document.createElement('tr');
        tr.className = aluno.elegivel ? 'linha-elegivel' : 'linha-nao-elegivel';

        const btnEye = aluno.elegivel
            ? `<button class="btn-eye" data-idx="${idx}">👁 Ver</button>`
            : `<button class="btn-eye" disabled title="Aluno não elegível">👁 Ver</button>`;

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
            <td>${btnEye}</td>
        `;
        tbody.appendChild(tr);
    });

    // Habilita botões
    const btnGerar = document.getElementById('generate-btn');
    btnGerar.disabled = elegiveisList.length === 0;
    btnGerar.textContent = elegiveisList.length === 0
        ? '📄 Nenhum aluno elegível'
        : `📄 Gerar ${elegiveisList.length} Certificado(s)`;

    const btnPreviewAll = document.getElementById('preview-all-btn');
    btnPreviewAll.disabled = elegiveisList.length === 0;
    btnPreviewAll.textContent = elegiveisList.length === 0
        ? '👁 Nenhum elegível'
        : `👁 Pré-visualizar Todos (${elegiveisList.length})`;

    // Listeners
    document.querySelectorAll('.nome-editavel').forEach(inp => {
        inp.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            alunosProcessados[idx].nome = e.target.value;
            // Atualiza a lista de elegíveis também
            const num = alunosProcessados[idx].numero;
            const eleg = elegiveisList.find(x => x.numero === num);
            if (eleg) eleg.nome = e.target.value;
        });
    });

    document.querySelectorAll('.btn-eye').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx);
            const aluno = alunosProcessados[idx];
            abrirModal(aluno, parseInt(document.getElementById('trimestre').value), idx);
        });
    });
}

// ============================================================
//  Modal de pré-visualização
// ============================================================
function abrirModal(aluno, trimestre, idx) {
    // Encontra o índice na lista de elegíveis
    previewIndexAtual = elegiveisList.findIndex(a => a.numero === aluno.numero);
    if (previewIndexAtual === -1) previewIndexAtual = 0;

    mostrarPreviewAtual(trimestre);
    modal.style.display = 'flex';
}

function mostrarPreviewAtual(trimestre) {
    if (elegiveisList.length === 0) {
        previewContainer.innerHTML = '<p style="padding:40px;color:#666;">Nenhum aluno elegível.</p>';
        return;
    }

    const aluno = elegiveisList[previewIndexAtual];
    if (!aluno) return;

    // Título
    modalTitle.textContent = `👁 ${aluno.nome} (${previewIndexAtual + 1}/${elegiveisList.length})`;

    // Renderiza o certificado no modal
    renderizarPreviewNoModal(aluno, trimestre);

    // Contador
    previewCounter.textContent = `${previewIndexAtual + 1} / ${elegiveisList.length}`;

    // Botões anterior/próximo
    previewPrev.disabled = previewIndexAtual === 0;
    previewNext.disabled = previewIndexAtual === elegiveisList.length - 1;
}

function fecharModal() {
    modal.style.display = 'none';
    previewContainer.innerHTML = '';
}

// Navegação
previewPrev.addEventListener('click', () => {
    if (previewIndexAtual > 0) {
        previewIndexAtual--;
        mostrarPreviewAtual(parseInt(document.getElementById('trimestre').value));
    }
});

previewNext.addEventListener('click', () => {
    if (previewIndexAtual < elegiveisList.length - 1) {
        previewIndexAtual++;
        mostrarPreviewAtual(parseInt(document.getElementById('trimestre').value));
    }
});

// Fechar modal
document.getElementById('close-modal').addEventListener('click', fecharModal);
document.getElementById('close-modal-2').addEventListener('click', fecharModal);

// Fechar ao clicar fora
modal.addEventListener('click', (e) => {
    if (e.target === modal) fecharModal();
});

// ESC fecha modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display === 'flex') {
        fecharModal();
    }
    if (modal.style.display === 'flex') {
        if (e.key === 'ArrowLeft') previewPrev.click();
        if (e.key === 'ArrowRight') previewNext.click();
    }
});

// ============================================================
//  Botão: Pré-visualizar Todos
// ============================================================
document.getElementById('preview-all-btn').addEventListener('click', () => {
    if (elegiveisList.length === 0) {
        alert('Nenhum aluno elegível.');
        return;
    }
    previewIndexAtual = 0;
    mostrarPreviewAtual(parseInt(document.getElementById('trimestre').value));
    modal.style.display = 'flex';
});

// ============================================================
//  Baixar o certificado atual do modal
// ============================================================
downloadCurrentBtn.addEventListener('click', async () => {
    if (elegiveisList.length === 0) return;

    const aluno = elegiveisList[previewIndexAtual];
    const trimestre = parseInt(document.getElementById('trimestre').value);

    downloadCurrentBtn.disabled = true;
    downloadCurrentBtn.textContent = '⏳ Gerando...';

    try {
        const blob = await gerarCertificadoBlob(aluno, trimestre);
        const nomeArq = `certificado_${String(aluno.numero).padStart(2, '0')}_${aluno.nome.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '')}.pdf`;
        saveAs(blob, nomeArq);
        downloadCurrentBtn.textContent = '✅ Baixado!';
        setTimeout(() => {
            downloadCurrentBtn.textContent = '📥 Baixar Este Certificado';
            downloadCurrentBtn.disabled = false;
        }, 1500);
    } catch (erro) {
        console.error(erro);
        alert('Erro ao baixar: ' + erro.message);
        downloadCurrentBtn.textContent = '📥 Baixar Este Certificado';
        downloadCurrentBtn.disabled = false;
    }
});

// ============================================================
//  Botão: Gerar certificados (ZIP)
// ============================================================
document.getElementById('generate-btn').addEventListener('click', async () => {
    const trimestre = parseInt(document.getElementById('trimestre').value);

    if (elegiveisList.length === 0) {
        alert('Nenhum aluno elegível para gerar certificados.');
        return;
    }

    const btn = document.getElementById('generate-btn');
    btn.disabled = true;
    genStatus.innerHTML = '<span class="processando">⏳ Gerando certificados...</span>';

    try {
        const zip = new JSZip();

        for (let i = 0; i < elegiveisList.length; i++) {
            const aluno = elegiveisList[i];
            genStatus.innerHTML = `<span class="processando">⏳ Gerando ${i + 1}/${elegiveisList.length}: ${aluno.nome}</span>`;

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
//  Botão: Testar com aluno fictício
// ============================================================
document.getElementById('test-btn').addEventListener('click', async () => {
    const trimestre = parseInt(document.getElementById('trimestre').value);
    genStatus.innerHTML = '<span class="processando">🧪 Gerando certificado de teste...</span>';

    try {
        await gerarCertificadoTeste(trimestre);
        genStatus.innerHTML = '<span class="ok">✅ Certificado de teste aberto em nova aba.</span>';
    } catch (erro) {
        console.error(erro);
        genStatus.innerHTML = `<span class="erro">❌ Erro: ${erro.message}</span>`;
    }
});

// ============================================================
//  Botão: Recomeçar
// ============================================================
document.getElementById('restart-btn').addEventListener('click', () => {
    if (!confirm('Recomeçar? Todos os dados serão perdidos.')) return;

    alunosProcessados = [];
    elegiveisList = [];
    previewIndexAtual = 0;
    inputPDF.value = '';
    fileList.innerHTML = '';
    status.innerHTML = '';
    genStatus.innerHTML = '';
    fecharModal();

    reviewSection.style.display = 'none';
    uploadSection.style.display = 'block';
});
