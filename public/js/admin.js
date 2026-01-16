document.getElementById('uploadBtn').addEventListener('click', showInputDialog);
document.getElementById('fileInput').addEventListener('change', uploadFile);

function showInputDialog(){
    document.getElementById('fileInput').click();
}

async function uploadFile(event){
    // Retrieve selected file
    const file = event.target.files[0];
    // Check if file exists or no
    if(!file){
        return;
    }
    console.log('Selected file:', file.name);
    // Store file data
    const fileName = file.name;
    const fileExtension = fileName.split('.').pop().toLowerCase();
    const allowedExtensions = ['xlsx', 'xls'];
    const allowedMimeTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel' // .xls
    ];
    const maxSize = 50 * 1024 * 1024; // 50MB in bytes
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
            // Don't set Content-Type header - browser sets it automatically with boundary
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