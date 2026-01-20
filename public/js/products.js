// Cart state (stored in localStorage)
let cart = JSON.parse(localStorage.getItem('cart')) || {};

// Helper function to check if image URL is valid
function hasValidImage(imageUrl) {
    return imageUrl && imageUrl.trim() !== '' && imageUrl.toUpperCase() !== 'NO IMAGE';
}

// Helper function to get image src or placeholder
function getImageSrc(imageUrl) {
    if (hasValidImage(imageUrl)) {
        return imageUrl.replace('public/', '../');
    }
    return null;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadProducts();
    updateCartUI();
    initializeEventListeners();
});

let products = []; // Store fetched products

async function loadProducts() {
    const grid = document.getElementById('productsGrid');
    
    // Show loading state
    grid.innerHTML = '<div class="col-12 text-center py-5"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></div>';
    
    try {
        const response = await fetch('/api/products');
        if (!response.ok) throw new Error('Failed to fetch products');
        
        products = await response.json();
        
        // Clear grid and display products
        grid.innerHTML = '';
        
        if (products.length === 0) {
            grid.innerHTML = '<div class="col-12 text-center py-5"><p class="text-muted">Aucun produit disponible</p></div>';
            return;
        }
        
        products.forEach(product => {
            const productCard = createProductCard(product);
            grid.appendChild(productCard);
        });
    } catch (error) {
        grid.innerHTML = '<div class="col-12 text-center py-5"><p class="text-danger">Erreur lors du chargement des produits</p></div>';
    }
}

// Create product card HTML
function createProductCard(product) {
    const col = document.createElement('div');
    col.className = 'col';
    // Checking data for proper html integration
    const isOutOfStock = product.stock_quantity === 0;
    const cartQuantity = cart[product.reference]?.quantity || 0;
    const isInCart = cartQuantity > 0;
    // Check if image is valid
    const hasImage = product.image_url && product.image_url.trim() !== '' && product.image_url.toUpperCase() !== 'NO IMAGE';
    // Html content
    col.innerHTML = `
        <div class="product-card ${isInCart ? 'selected' : ''}" data-reference="${product.reference}" style="cursor: pointer;">
            ${hasImage ? 
                `<img src="${product.image_url.replace('public/', '../')}" class="product-image" alt="${product.description}"
                     onerror="this.src='/images/products/default-product.png'">` :
                `<div class="product-image d-flex align-items-center justify-content-center bg-light text-muted border">
                    <i class="bi bi-image" style="font-size: 3rem;"></i>
                </div>`
            }
            
            <div class="product-body">
                <div class="product-price text-center fs-4">${product.price_per_unit} €</div>
                <div class="product-title text-center fs-6">${product.description}</div>
                
                ${isOutOfStock ? 
                    `<div class="product-stock stock-out fs-6">
                        <i class="bi bi-x-circle"></i> En rupture de stock
                    </div>` :
                    `<div class="product-stock stock-available fs-6 d-flex justify-content-between">
                        <span>En Stock :</span>
                        <span>${product.stock_quantity}</span>
                    </div>`
                }
                
                
                ${!isOutOfStock ? `
                    <div class="quantity-input w-100 mt-auto">
                        <button class="btn-decrease" data-reference="${product.reference}">-</button>
                        <input type="number" 
                            class="quantity-value w-50" 
                            value="${cartQuantity}" 
                            min="0" 
                            max="${product.stock_quantity}"
                            data-reference="${product.reference}">
                        <button class="btn-increase" data-reference="${product.reference}">+</button>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
    
    return col;
}

// Initialize event listeners
function initializeEventListeners() {
    
    // Clear cart
    document.getElementById('clearCartBtn').addEventListener('click', clearCart);
    
    // Validate order
    document.getElementById('validateOrderBtn').addEventListener('click', validateOrder);
    
    // Product quantity controls
    document.getElementById('productsGrid').addEventListener('click', handleProductInteraction);
    document.getElementById('productsGrid').addEventListener('input', handleQuantityInput);
    
    // Handling cart clicks(mobile version)
    const cartToggleBtn = document.getElementById('cartToggleBtn');
    const cartOverlay = document.getElementById('cartOverlay');
    
    cartToggleBtn.addEventListener('click', toggleCart);
    cartOverlay.addEventListener('click', toggleCart);

    // Initialize modal listeners
    initializeModalListeners();
}

// Handle product interactions (clicks on +, -, add to cart)
function handleProductInteraction(e) {
    const target = e.target;
    
    // Handle button clicks first
    if (target.classList.contains('btn-increase')) {
        e.stopPropagation();
        const reference = target.dataset.reference;
        if (reference) changeQuantity(reference, 1);
        return;
    }
    
    if (target.classList.contains('btn-decrease')) {
        e.stopPropagation();
        const reference = target.dataset.reference;
        if (reference) changeQuantity(reference, -1);
        return;
    }
    
    if (target.classList.contains('quantity-value')) {
        e.stopPropagation();
        return;
    }
    
    // Handle product card click and send selected quantities to modal(like simple dialog that displays product details)
    const card = target.closest('.product-card');
    if (card) {
        const reference = card.dataset.reference;
        if (reference) {
            const quantityInput = card.querySelector('.quantity-value');
            const currentQuantity = quantityInput ? parseInt(quantityInput.value) || 0 : 0;
            openProductModal(reference, currentQuantity);
        }
    }
}

// Handle direct quantity input to not exceed limits and not go below 0
function handleQuantityInput(e) {
    if (e.target.classList.contains('quantity-value')) {
        const reference = e.target.dataset.reference;
        const quantity = parseInt(e.target.value) || 0;
        const product = products.find(p => p.reference === reference);

        if (!product) return; // Safety check

        if (quantity > product.stock_quantity) {
            e.target.value = product.stock_quantity;
            return;
        }
        
        if (quantity < 0) {
            e.target.value = 0;
            return;
        }
        // Update cart after each quantity changes
        updateCart(reference, quantity);
    }
}

// Change quantity (+ or -)
function changeQuantity(reference, delta) {
    const product = products.find(p => p.reference === reference);
    const currentQuantity = cart[reference]?.quantity || 0;
    const newQuantity = Math.max(0, Math.min(product.stock_quantity, currentQuantity + delta));
    
    updateCart(reference, newQuantity);
}

// Update cart state
function updateCart(reference, quantity) {
    const product = products.find(p => p.reference === reference);
    
    if (quantity > 0) {
        cart[reference] = {
            ...product,
            quantity: quantity
        };
    } else {
        delete cart[reference];
    }
    
    // Save to localStorage
    localStorage.setItem('cart', JSON.stringify(cart));
    
    // Update UI
    updateCartUI();
    updateProductCard(reference);
}

// Cache cart DOM elements for better performance
let cartItems, cartCount, cartTotal;
// Update cart UI (sidebar)
function updateCartUI() {
    // Cache elements on first call
    if (!cartItems) {
        cartItems = document.getElementById('cartItems');
        cartCount = document.getElementById('cartCount');
        cartTotal = document.getElementById('cartTotal');
    }
    // const cartItems = document.getElementById('cartItems');
    // const cartCount = document.getElementById('cartCount');
    // const cartTotal = document.getElementById('cartTotal');
    
    const items = Object.values(cart);
    
    if (items.length === 0) {
        cartItems.innerHTML = `
            <div class="text-center text-muted py-5" id="emptyCartMessage">
                <i class="bi bi-cart-x fs-1 d-block mb-2"></i>
                <p>Votre panier est vide</p>
            </div>
        `;
        cartCount.textContent = '0';
        cartTotal.textContent = '0 €';
        return;
    }
    
    let totalItems = 0;
    let totalPrice = 0;
    
    const cartHTML = items.map(item => {
        totalItems += item.quantity;
        totalPrice += item.price_per_unit * item.quantity;
        const hasImage = item.image_url && item.image_url.trim() !== '' && item.image_url.toUpperCase() !== 'NO IMAGE';
        
        return `
            <div class="cart-item">
                <div class="d-flex">
                    ${hasImage ? 
                        `<img src="${item.image_url.replace('public/', '../')}" class="cart-item-image me-2" alt="${item.description}"
                             onerror="this.src='/images/products/default-product.png'">` :
                        `<div class="cart-item-image me-2 d-flex align-items-center justify-content-center bg-light text-muted border">
                            <i class="bi bi-image"></i>
                        </div>`
                    }
                    <div class="flex-grow-1">
                        <div class="cart-item-title">${item.description}</div>
                        <div class="cart-item-price">${item.price_per_unit} €</div>
                        <div class="cart-item-quantity">Qté: ${item.quantity}</div>
                    </div>
                    <button class="btn btn-sm btn-link text-danger" onclick="removeFromCart('${item.reference}')">
                        <i class="bi bi-x"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    cartItems.innerHTML = cartHTML;
    cartCount.textContent = totalItems;
    cartTotal.textContent = totalPrice.toFixed(2) + ' €';
}

// Update product card appearance
function updateProductCard(reference) {
    const card = document.querySelector(`.product-card[data-reference="${reference}"]`);
    if (!card) return;
    
    const quantity = cart[reference]?.quantity || 0;
    const input = card.querySelector('.quantity-value');
    
    // Update input value without destroying the card
    if (input && document.activeElement !== input) {
        // Only update if user is not currently typing in it
        input.value = quantity;
    }
    
    // Update selected state
    if (quantity > 0) {
        card.classList.add('selected');
    } else {
        card.classList.remove('selected');
    }
}

// Remove from cart
function removeFromCart(reference) {
    delete cart[reference];
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartUI();
    updateProductCard(reference);
}

// Clear entire cart
function clearCart() {
    const items = Object.values(cart);
    
    if (items.length === 0) {
        alert('Votre panier est vide');
        return;
    }
    
    if (confirm('Vider le panier ?')) {
        cart = {};
        localStorage.setItem('cart', JSON.stringify(cart));
        updateCartUI();
        loadProducts(); // Reload to reset all cards
    }
}

function toggleCart() {
    const sidebar = document.getElementById('cartSidebar');
    const overlay = document.getElementById('cartOverlay');
    
    // Check if already open
    const isOpen = sidebar.classList.contains('open');
    if (isOpen) {
        // Close cart
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
        document.body.style.overflow = ''; // Re-enable scroll
    } else {
        // Open cart
        sidebar.classList.add('open');
        overlay.classList.add('show');
        document.body.style.overflow = 'hidden'; // Prevent background scroll
    }
}

// Validate order
function validateOrder() {
    const items = Object.values(cart);
    
    if (items.length === 0) {
        alert('Votre panier est vide');
        return;
    }
    
    // Prompt for client identifier
    const clientIdentifier = prompt('Entrez votre identifiant client:');
    
    if (!clientIdentifier || !clientIdentifier.trim()) {
        alert('Identifiant client requis pour valider la commande');
        return;
    }
    // Prepare order data
    const orderData = {
        clientIdentifier: clientIdentifier.trim(),
        items: items.map(item => ({
            reference: item.reference,
            quantity: item.quantity
        }))
    };
    
    // Send order to backend
    fetch('/api/orders', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(orderData)
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => {
                throw new Error(err.error || 'Failed to create order');
            });
        }
        return response.json();
    })
    .then(data => {
        // Download Excel file(By creating html element to download file and click it then)
        const downloadLink = document.createElement('a');
        downloadLink.href = data.filePath;
        downloadLink.download = data.filePath.split('/').pop();
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        
        // Show success message
        // alert(`Commande créée avec succès!\nNombre de produits: ${data.productCount}\nMontant total: ${data.totalAmount} DA`);
        alert(`Commande créée avec succès!
Nombre de produits: ${data.productCount}
Montant total: ${data.totalAmount} €
Votre commande a été enregistrée avec succès.
Votre agent commercial, Amine Telitel, vous remercie pour votre confiance.
La facture proforma vous sera transmise dans les plus brefs délais via WhatsApp ou par e-mail.
Il vous contactera très prochainement afin de confirmer la commande.
Informations supplémentaires :
En général, la préparation de la proforma prend entre 1 heure et 48 heures, selon la disponibilité de l’agent commercial.
Après confirmation de la commande et envoi du virement, la réception du paiement est généralement confirmée dans les 24 heures.
Si vous souhaitez envoyer un camion pour récupérer la marchandise, veuillez contacter l’agent commercial pour établir un planning.
Si la société prend en charge l’envoi de la commande (France, Belgique), la livraison est effectuée en environ 6 à 8 jours après confirmation du paiement.
Pour les expéditions hors Europe, les délais peuvent varier selon les prévisions des compagnies maritimes.`);
        
        // Clear cart
        clearCart();
        
    })
    .catch(error => {
        alert(`Erreur lors de la création de la commande: ${error.message}`);
    });
    // clearCart();    
}

// Toast notification
function showToast(message) {
    // Simple alert for now
    const toast = document.createElement('div');
    toast.className = 'position-fixed bottom-0 end-0 p-3';
    toast.style.zIndex = '9999';
    toast.innerHTML = `
        <div class="toast show" role="alert">
            <div class="toast-body bg-success text-white rounded">
                ${message}
            </div>
        </div>
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 2000);
}

// Modal functionality
let currentModalProduct = null;
let modalQuantity = 0;

function openProductModal(reference, currentQuantity) {
    const product = products.find(p => p.reference === reference);
    if (!product) return;
    
    currentModalProduct = product;
    modalQuantity = currentQuantity;
    
    // Check if image is valid
    const hasImage = product.image_url && product.image_url.trim() !== '' && product.image_url.toUpperCase() !== 'NO IMAGE';
    
    // Populate modal with product data
    const modalImage = document.getElementById('modalProductImage');
    const modalImageContainer = modalImage.parentElement;
    
    if (hasImage) {
        modalImage.src = product.image_url.replace('public/', '../');
        modalImage.style.display = 'block';
        // Remove any existing placeholder
        const placeholder = modalImageContainer.querySelector('.no-image-placeholder');
        if (placeholder) placeholder.remove();
    } else {
        modalImage.style.display = 'none';
        // Add placeholder if not exists
        let placeholder = modalImageContainer.querySelector('.no-image-placeholder');
        if (!placeholder) {
            placeholder = document.createElement('div');
            placeholder.className = 'no-image-placeholder d-flex align-items-center justify-content-center bg-light text-muted border rounded';
            placeholder.style.height = '400px';
            placeholder.innerHTML = '<i class="bi bi-image" style="font-size: 5rem;"></i>';
            modalImageContainer.appendChild(placeholder);
        }
    }
    document.getElementById('modalProductTitle').textContent = product.description;
    document.getElementById('modalProductPrice').textContent = product.price_per_unit + ' €';
    document.getElementById('modalProductStock').textContent = `En Stock: ${product.stock_quantity}`;
    
    // Build details table (using dummy data for now - will be replaced with real DB data)
    const details = `
        <tr><td>Reference:</td><td>${product.reference}</td></tr>
        <tr><td>EAN:</td><td>8001480020429</td></tr>
        <tr><td>Date d'expiration:</td><td>No</td></tr>
        <tr><td>U Box:</td><td>10</td></tr>
        <tr><td>Box Layer:</td><td>7</td></tr>
        <tr><td>UD/Pal U Palet:</td><td>350</td></tr>
        <tr><td>Box Patel:</td><td>35</td></tr>
        <tr><td>DUN:</td><td>08001480109704</td></tr>
        <tr><td>Languages:</td><td>espagnol, francais</td></tr>
        <tr><td>PESO:</td><td>22.5</td></tr>
    `;
    document.getElementById('modalProductDetails').innerHTML = details;
    
    // Set quantity input
    document.getElementById('modalQuantity').value = modalQuantity;
    document.getElementById('modalQuantity').max = product.stock_quantity;
    
    // Update total
    updateModalTotal();
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('productModal'));
    modal.show();
    // TODO: Handle modal close to be initialized in initializeModalListeners
    document.getElementById('modalBtnClose').addEventListener('click', () => {
        modal.hide();
    });
    document.getElementById('modalAddToCart').addEventListener('click', () => {
        modal.hide();
    });
    
}
// Update modal product total price
function updateModalTotal() {
    if (!currentModalProduct) return;
    
    const total = currentModalProduct.price_per_unit * modalQuantity;
    document.getElementById('modalTotal').textContent = total.toFixed(2) + ' €';
}

function initializeModalListeners() {
    // Quantity decrease    
    document.getElementById('modalBtnDecrease').addEventListener('click', () => {
        const input = document.getElementById('modalQuantity');
        if (modalQuantity >= 1) {
            modalQuantity--;
            input.value = modalQuantity;
            updateModalTotal();
        }
    });
    
    // Quantity increase
    document.getElementById('modalBtnIncrease').addEventListener('click', () => {
        const input = document.getElementById('modalQuantity');
        if (modalQuantity < currentModalProduct.stock_quantity) {
            modalQuantity++;
            input.value = modalQuantity;
            updateModalTotal();
        }
    });
    
    // Direct input
    document.getElementById('modalQuantity').addEventListener('input', (e) => {
        let value = parseInt(e.target.value) || 1;
        value = Math.max(1, Math.min(currentModalProduct.stock_quantity, value));
        modalQuantity = value;
        e.target.value = value;
        updateModalTotal();
    });

    document.getElementById('modalAddToCart').addEventListener('click', () => {
        if (currentModalProduct) {
            updateCart(currentModalProduct.reference, modalQuantity);
        }
    });
    
}