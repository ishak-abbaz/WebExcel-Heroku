
document.addEventListener('DOMContentLoaded', function() {
    loadOrders();
    initializeAdminEventListeners();
});

function initializeAdminEventListeners() {
    document.getElementById('uploadBtn').addEventListener('click', showInputDialog);
    document.getElementById('fileInput').addEventListener('change', uploadFile);
    document.getElementById('uploadBtnSide').addEventListener('click', showInputDialog);
    document.getElementById('fileInput').addEventListener('change', fileInputHandler);
}


function showInputDialog(){
    document.getElementById('fileInput').click();
}
async function fileInputHandler(event){
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/admin/products/import', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            showToast(`${result.imported} produits importés avec succès!`, 'success');
            e.target.value = '';
        } else {
            showToast(`Erreur: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast('Erreur lors de l\'importation', 'error');
    }
}

async function uploadFile(event){
    // Retrieve selected file
    const file = event.target.files[0];
    // Check if file exists or no
    if(!file){
        return;
    }
    // Store file data
    const fileName = file.name;
    const fileExtension = fileName.split('.').pop().toLowerCase();
    const allowedExtensions = ['xlsx', 'xls'];
    const allowedMimeTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel' // .xls
    ];
    const maxSize = 52428800; // 50MB in bytes
    // Check file extension validity
    if (
        !allowedExtensions.includes(fileExtension) ||
        !allowedMimeTypes.includes(file.type)
    ) {
        alert('Invalid file type. Please upload an Excel file (.xlsx or .xls)');
        return;
    }
    // Check file size validity
    if (file.size > maxSize) {
        alert('File is too large. Maximum size is 50MB');
        return;
    }
    // Prepare form data for upload
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/admin/products/import', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert(`Success! Imported ${data.count} products`);
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        alert('Network error. Please try again.');
    }
}

// Display orders in admin dashboard section

// Load orders on page load
// document.addEventListener('DOMContentLoaded', function() {
    // loadOrders();
// });

// Toast notification helper
function showToast(message, type = 'success') {
    const icon = type === 'success' ? 'fas fa-check' : 'fas fa-exclamation-triangle';
    const bgClass = type === 'success' ? 'bg-success' : 'bg-danger';
    
    
    $(document).Toasts('create', {
        class: bgClass,
        title: type === 'success' ? 'Succès' : 'Erreur',
        body: message,
        icon: icon,
        autohide: true,
        delay: 4000
    });
}
// Update header stats function(Orders count and total amount)
function updateHeaderStats(orderCount, totalAmount){
    document.getElementById('orderCount').textContent = orderCount;
    document.getElementById('totalAmount').textContent = totalAmount.toFixed(2);
}

// Load all orders from API
async function loadOrders() {
    const tableBody = document.getElementById('ordersTableBody');
    
    try {
        // Get request to retrieve all orders stored in database
        const response = await fetch('/api/orders');
        
        if (!response.ok) {
            throw new Error('Failed to fetch orders');
        }
        
        const orders = await response.json();
        
        // Calculate totals
        const orderCount = orders.length;
        const totalAmount = orders.reduce((sum, order) => sum + parseFloat(order.total_amount || 0), 0);

        updateHeaderStats(orderCount, totalAmount);

        if (orders.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted">
                        <i class="fas fa-inbox"></i> Aucune commande disponible
                    </td>
                </tr>
            `; 
            return;
        }

        // Build table rows
        const rows = orders.map(order => {
            const date = new Date(order.created_at);
            const formattedDate = date.toLocaleString('fr-FR', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            return `
                <tr>
                    <td><strong>#${order.order_number}</strong></td>
                    <td>${order.client_identifier}</td>
                    <td class="text-center">${order.product_count}</td>
                    <td><strong>${parseFloat(order.total_amount).toFixed(2)} €</strong></td>
                    <td>${formattedDate}</td>
                    <td class="text-nowrap">
                        <button type="button" class="btn btn-success btn-sm" 
                                onclick="downloadOrder('${order.file_path}')" 
                                title="Télécharger">
                            <i class="fas fa-download"></i> Télécharger
                        </button>
                        <button type="button" class="btn btn-danger btn-sm" 
                                onclick="confirmDeleteOrder(${order.order_number})" 
                                title="Supprimer">
                            <i class="fas fa-trash"></i> Supprimer
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        tableBody.innerHTML = rows;
        
    } catch (error) {
        showToast('Erreur lors du chargement des commandes', 'error');
        // Update table to show error message
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-danger">
                    <i class="fas fa-exclamation-triangle"></i> Erreur lors du chargement
                </td>
            </tr>
        `;
    }
}

// Download order Excel file
async function downloadOrder(filePath) {
    if (!filePath) {
        showToast('Chemin du fichier manquant', 'error');
        return;
    }
    try {
        // Check if file exists
        const response = await fetch(filePath, { method: 'HEAD' });
        
        if (!response.ok) {
            showToast('Le fichier n\'existe plus sur le serveur', 'error');
            return;
        }
        
        // Create hidden link and trigger download
        const link = document.createElement('a');
        link.href = filePath;
        link.download = filePath.split('/').pop();
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showToast('Téléchargement démarré', 'success');
        
    } catch (error) {
        showToast('Erreur lors du téléchargement', 'error');
    }
}

// Show delete confirmation modal
function confirmDeleteOrder(orderNumber) {
    document.getElementById('deleteOrderNumber').textContent = orderNumber;
    $('#deleteOrderModal').modal('show');
    
    // Set up confirm button (remove previous handlers first)
    document.getElementById('confirmDeleteBtn').onclick = function() {
        deleteOrder(orderNumber);
    }
}

// Delete order
async function deleteOrder(orderNumber) {
    try {
        const response = await fetch(`/api/orders/${orderNumber}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Echec de supprimer la commande');
        }
        
        // Close modal
        $('#deleteOrderModal').modal('hide');
        
        // Show success message
        showToast(`Commande #${orderNumber} supprimée avec succès`, 'success');
        
        // Reload orders table
        setTimeout(() => loadOrders(), 500);
        
    } catch (error) {
        console.error('Error deleting order:', error);
        showToast(`Erreur: ${error.message}`, 'error');
    }
}