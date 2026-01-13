document.getElementById('viewCartBtn').addEventListener('click', testButton);
document.getElementById('deleteBtn').addEventListener('click', deleteButton);

async function testButton(){
    const itemData = {
        reference: 'TR00029',
        description: 'Test Description',
        price_per_unit: 1.03,
        stock_quantity: 150,
        image_url: '../images/products/product1.jpg',
        extra_columns: {}
    };

    try{
        // Send POST request to add the item
        const response = await fetch('/api/products', {
            method: 'POST',
            // Tell website sending type
            headers: {
            'Content-Type': 'application/json'
            },
            body: JSON.stringify(itemData)
        });

        const result = await response.json();

        if (result.success) {
            alert('Success:', result.message);
        } else {
            alert('Failed to add item');
        }
    }catch(error){
        console.log("DEBUGGING ERROR", error)
        alert('Request failed');
    }
    
    

}
async function deleteButton(){
    const reference = 'TR00029';

    try{
        // Send DELETE request to delete the item
        const response = await fetch(`/api/products/${reference}`, {
            method: 'DELETE',
        });

        const result = await response.json();

        if (result.success) {
            alert('Deletion success:', result.message);
        } else {
            alert('Failed to delete item');
        }
    }catch(error){
        console.log("DEBUGGING ERROR", error)
        alert('Request failed');
    }

}