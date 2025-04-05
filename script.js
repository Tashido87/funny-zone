// Google Sheets API Configuration
const API_KEY = 'AIzaSyAztNSJf-fBpvsCfrv8x7oR2ViLKRLQErc';
const CLIENT_ID = '609536649533-ta5o3b6d1dgess21sedlr2arsr8ms1h6.apps.googleusercontent.com'; // Replace if incorrect
const SPREADSHEET_ID = '1GzdaBH2Hq7LVx9svDkdlMHr01eODjy9haFMTJFIqgI4';
const INVENTORY_SHEET = 'Inventory';
const SALES_SHEET = 'Sale_Log';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

// Global data storage
let inventoryData = [];
let salesData = [];
let isDataLoaded = false;
let gapiInited = false;
let tokenClient;

// DOM elements
const DOM = {
    loader: document.getElementById('loader'),
    noResults: document.getElementById('noResults'),
    resultsTable: document.getElementById('resultsTable'),
    searchBtn: document.getElementById('searchBtn'),
    resetBtn: document.getElementById('resetBtn'),
    modal: document.getElementById('orderDetailsModal'),
    closeModal: document.querySelector('#orderDetailsModal .close'),
    customMonth: document.getElementById('customMonth'),
    customYear: document.getElementById('customYear'),
    viewHistoryBtn: document.getElementById('viewHistoryBtn'),
    totalSales: document.getElementById('totalSales'),
    totalProfit: document.getElementById('totalProfit'),
    orderCount: document.getElementById('orderCount'),
    itemsSold: document.getElementById('itemsSold'),
    salesChange: document.getElementById('salesChange'),
    profitChange: document.getElementById('profitChange'),
    inventoryCards: document.getElementById('inventoryCards'),
    formModal: document.getElementById('formModal'),
    formContent: document.getElementById('formContent'),
};

// Utility functions
const formatNumberWithCommas = (number) => {
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const showLoader = () => DOM.loader.classList.remove('hidden');
const hideLoader = () => DOM.loader.classList.add('hidden');

// Google API Initialization
function loadGapi() {
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    try {
        await gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
        });
        console.log('GAPI client initialized');
        gapiInited = true;
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (response) => {
                if (response.access_token) {
                    console.log('Access token received:', response.access_token);
                    gapi.client.setToken({ access_token: response.access_token });
                    fetchSheetData();
                } else {
                    console.error('Authentication failed:', response);
                    alert('Authentication failed. Please check your Client ID and permissions.');
                }
            },
        });
        console.log('Requesting access token...');
        tokenClient.requestAccessToken();
    } catch (error) {
        console.error('GAPI initialization error:', error);
        alert('Failed to initialize Google API client: ' + error.message);
    }
}

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', async () => {
    showLoader();
    loadGapi();
    try {
        setupHistoryControls();
        setDefaultDateRange();
        setupEventListeners();
    } catch (error) {
        console.error('Initialization failed:', error);
        alert('Failed to initialize. Please check your connection and try again.');
    }
});

// Fetch data from Google Sheets
async function fetchSheetData() {
    if (!gapiInited) {
        console.log('GAPI not initialized yet');
        return;
    }
    showLoader();
    try {
        const fetchData = async (sheet) => {
            console.log(`Fetching data from ${sheet}...`);
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: sheet,
            });
            const result = response.result;
            console.log(`Data fetched from ${sheet}:`, result.values);
            if (!result.values || result.values.length <= 1) return [];
            const headers = result.values[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
            return result.values.slice(1).map(row => {
                const item = {};
                headers.forEach((header, index) => {
                    item[header] = row[index] || '';
                });
                return item;
            });
        };

        inventoryData = await fetchData(INVENTORY_SHEET);
        salesData = await fetchData(SALES_SHEET);
        isDataLoaded = true;
        console.log('Inventory Data:', inventoryData);
        console.log('Sales Data:', salesData);
        updateDashboardSummary();
        populateInventoryCards();
    } catch (error) {
        console.error('Fetch error:', error);
        alert('Failed to load data: ' + error.message);
    } finally {
        hideLoader();
    }
}

// Setup history controls
function setupHistoryControls() {
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    months.forEach((month, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = month;
        DOM.customMonth.appendChild(option);
    });

    const year = 2025;
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    DOM.customYear.appendChild(option);

    const today = new Date();
    DOM.customMonth.value = today.getMonth();
    DOM.customYear.value = year;
}

// Update dashboard summary stats
function updateDashboardSummary() {
    if (!salesData.length || !inventoryData.length) {
        resetDashboardSummary();
        return;
    }

    const selectedMonth = parseInt(DOM.customMonth.value);
    const selectedYear = parseInt(DOM.customYear.value);

    const selectedSales = salesData.filter(sale => {
        const saleDate = new Date(sale.order_date);
        const isMatchingDate = saleDate.getMonth() === selectedMonth && saleDate.getFullYear() === selectedYear;
        const remarks = (sale.remarks || '').toLowerCase();
        const isNotCanceledOrReturned = !remarks.includes('cancel') && !remarks.includes('return');
        return isMatchingDate && isNotCanceledOrReturned;
    });

    const totalSalesValue = Math.floor(selectedSales.reduce((total, sale) => total + (parseFloat(sale.total_value) || 0), 0));
    const totalProfit = Math.floor(selectedSales.reduce((total, sale) => {
        const sellingPrice = parseFloat(sale.selling_price) || 0;
        const quantitySold = parseInt(sale.quantity_sold) || 0;
        const itemName = sale.item_purchased || '';
        const inventoryItem = inventoryData.find(item => item.item_name === itemName);
        const purchasedPrice = inventoryItem ? (parseFloat(inventoryItem.purchased_price) || 0) : 0;
        const profitPerOrder = (sellingPrice - purchasedPrice) * quantitySold;
        return total + profitPerOrder;
    }, 0));

    const orderCount = selectedSales.length;
    const itemsSold = selectedSales.reduce((total, sale) => total + (parseInt(sale.quantity_sold) || 0), 0);

    let prevMonth = selectedMonth - 1;
    let prevYear = selectedYear;
    if (prevMonth < 0) {
        prevMonth = 11;
        prevYear--;
    }

    const prevPeriodSales = salesData.filter(sale => {
        const saleDate = new Date(sale.order_date);
        const isMatchingDate = saleDate.getMonth() === prevMonth && saleDate.getFullYear() === prevYear;
        const remarks = (sale.remarks || '').toLowerCase();
        const isNotCanceledOrReturned = !remarks.includes('cancel') && !remarks.includes('return');
        return isMatchingDate && isNotCanceledOrReturned;
    });

    const prevPeriodSalesValue = prevPeriodSales.reduce((total, sale) => total + (parseFloat(sale.total_value) || 0), 0);
    const salesChange = prevPeriodSalesValue === 0 ? (totalSalesValue > 0 ? 100 : 0) : ((totalSalesValue - prevPeriodSalesValue) / prevPeriodSalesValue) * 100;

    DOM.totalSales.textContent = `${formatNumberWithCommas(totalSalesValue)} MMK`;
    DOM.totalProfit.textContent = `${formatNumberWithCommas(totalProfit)} MMK`;
    DOM.orderCount.textContent = orderCount;
    DOM.itemsSold.textContent = itemsSold;

    DOM.salesChange.innerHTML = `<i class="fas fa-arrow-${salesChange >= 0 ? 'up' : 'down'}"></i> ${Math.abs(salesChange).toFixed(1)}%`;
    DOM.salesChange.className = `stat-change ${salesChange >= 0 ? 'positive' : 'negative'}`;
    DOM.profitChange.innerHTML = `<i class="fas fa-arrow-${salesChange >= 0 ? 'up' : 'down'}"></i> ${Math.abs(salesChange).toFixed(1)}%`;
    DOM.profitChange.className = `stat-change ${salesChange >= 0 ? 'positive' : 'negative'}`;
}

// Populate inventory cards
function populateInventoryCards() {
    if (!inventoryData.length) return;

    DOM.inventoryCards.innerHTML = '';

    const sortedInventory = [...inventoryData]
        .filter(item => item.item_name && item.remaining)
        .sort((a, b) => (parseInt(a.remaining) || 0) - (parseInt(b.remaining) || 0))
        .slice(0, 8);

    sortedInventory.forEach(item => {
        const remaining = parseInt(item.remaining) || 0;
        const total = parseInt(item.total_purchased) || 1;
        const percentRemaining = (remaining / total) * 100;

        let stockClass = 'in-stock';
        let stockText = 'In Stock';
        if (remaining <= 0) {
            stockClass = 'out-of-stock';
            stockText = 'Out of Stock';
        } else if (percentRemaining < 20) {
            stockClass = 'low-stock';
            stockText = 'Low Stock';
        }

        const card = document.createElement('div');
        card.className = 'inventory-card';
        card.innerHTML = `
            <h4 title="${item.item_name}">${item.item_name}</h4>
            <div class="inventory-details">
                <p><span>Purchase Price:</span> <span>${item.purchased_price || '0'} MMK</span></p>
                <p><span>In Stock:</span> <span>${remaining}</span></p>
                <p><span>Selling Price:</span> <span>${item.selling_price || '0'} MMK</span></p>
                <p><span>Profit:</span> <span>${item.profit || '0'} MMK</span></p>
            </div>
            <div class="stock-status ${stockClass}">${stockText}</div>
        `;
        DOM.inventoryCards.appendChild(card);
    });
}

// Form Handling
function showForm(type) {
    if (!isDataLoaded) {
        alert('Data is still loading. Please wait.');
        return;
    }
    DOM.formModal.style.display = 'block';
    if (type === 'addInventory') {
        DOM.formContent.innerHTML = getAddInventoryForm();
        setupAddInventoryForm();
    } else if (type === 'newSale') {
        DOM.formContent.innerHTML = getNewSaleForm();
        setupNewSaleForm();
    } else if (type === 'cancelReturn') {
        DOM.formContent.innerHTML = getCancelReturnForm();
        setupCancelReturnForm();
    }
}

function closeFormModal() {
    DOM.formModal.style.display = 'none';
    DOM.formContent.innerHTML = '';
}

// Add Inventory Form
function getAddInventoryForm() {
    return `
        <h2>Add Inventory</h2>
        <form id="addInventoryForm">
            <div class="toggle-buttons">
                <button type="button" class="toggle-btn active" id="existingBtn">Existing Item</button>
                <button type="button" class="toggle-btn" id="newBtn">New Item</button>
            </div>
            <div id="existingItemDiv" class="form-group">
                <label for="existingItem">Select Item:</label>
                <select id="existingItem" name="existingItem">
                    <option value="">-- Select an Item --</option>
                    ${inventoryData.map(item => `<option value="${item.item_name}">${item.item_name}</option>`).join('')}
                </select>
            </div>
            <div id="newItemDiv" class="form-group" style="display: none;">
                <label for="newItem">New Item Name:</label>
                <input type="text" id="newItem" name="newItem">
            </div>
            <div class="form-group">
                <label for="codeNo">Code No. (Optional):</label>
                <input type="text" id="codeNo" name="codeNo">
            </div>
            <div class="form-group">
                <label for="purchasedPrice">Purchased Price:</label>
                <input type="number" id="purchasedPrice" name="purchasedPrice" required min="0" step="0.01">
            </div>
            <div class="form-group">
                <label for="sellingPrice">Selling Price:</label>
                <input type="number" id="sellingPrice" name="sellingPrice" required min="0" step="0.01">
            </div>
            <div class="form-group">
                <label for="totalPurchased">Total Purchased:</label>
                <input type="number" id="totalPurchased" name="totalPurchased" required min="1">
            </div>
            <div class="form-group">
                <label for="remark">Remark (Optional):</label>
                <textarea id="remark" name="remark" rows="3"></textarea>
            </div>
            <div class="btn-container">
                <button type="button" class="glass-btn btn-secondary" onclick="closeFormModal()">Cancel</button>
                <button type="submit" class="glass-btn btn-primary">Submit</button>
            </div>
        </form>
    `;
}

function setupAddInventoryForm() {
    const existingBtn = document.getElementById('existingBtn');
    const newBtn = document.getElementById('newBtn');
    const existingDiv = document.getElementById('existingItemDiv');
    const newDiv = document.getElementById('newItemDiv');

    if (!existingBtn || !newBtn || !existingDiv || !newDiv) {
        console.error('One or more elements not found:', { existingBtn, newBtn, existingDiv, newDiv });
        return;
    }

    // Set initial state
    existingBtn.classList.add('active');
    newBtn.classList.remove('active');
    existingDiv.style.display = 'block';
    newDiv.style.display = 'none';

    // Toggle logic
    existingBtn.addEventListener('click', () => {
        existingBtn.classList.add('active');
        newBtn.classList.remove('active');
        existingDiv.style.display = 'block';
        newDiv.style.display = 'none';
    });

    newBtn.addEventListener('click', () => {
        newBtn.classList.add('active');
        existingBtn.classList.remove('active');
        newDiv.style.display = 'block';
        existingDiv.style.display = 'none';
    });

    document.getElementById('addInventoryForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const isExisting = existingBtn.classList.contains('active');
        const itemName = isExisting ? 
            document.getElementById('existingItem').value : 
            document.getElementById('newItem').value;
        
        if (!itemName) {
            alert('Please select or enter an item name');
            return;
        }

        const formData = {
            itemName,
            codeNo: document.getElementById('codeNo').value,
            purchasedPrice: parseFloat(document.getElementById('purchasedPrice').value),
            sellingPrice: parseFloat(document.getElementById('sellingPrice').value),
            totalPurchased: parseInt(document.getElementById('totalPurchased').value),
            remark: document.getElementById('remark').value,
        };

        try {
            const existingItem = inventoryData.find(item => item.item_name === itemName && parseFloat(item.purchased_price) === formData.purchasedPrice);
            if (existingItem) {
                const rowIndex = inventoryData.indexOf(existingItem) + 2;
                const newTotalPurchased = (parseInt(existingItem.total_purchased) || 0) + formData.totalPurchased;
                await gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${INVENTORY_SHEET}!F${rowIndex}`,
                    valueInputOption: 'USER_ENTERED',
                    values: [[newTotalPurchased]],
                });
                await gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${INVENTORY_SHEET}!E${rowIndex}`,
                    valueInputOption: 'USER_ENTERED',
                    values: [[formData.sellingPrice]],
                });
                if (formData.remark) {
                    await gapi.client.sheets.spreadsheets.values.update({
                        spreadsheetId: SPREADSHEET_ID,
                        range: `${INVENTORY_SHEET}!J${rowIndex}`,
                        valueInputOption: 'USER_ENTERED',
                        values: [[formData.remark]],
                    });
                }
            } else {
                const newRow = [
                    formData.itemName,
                    formData.codeNo,
                    `=F${inventoryData.length + 2}-(G${inventoryData.length + 2}+H${inventoryData.length + 2})`,
                    formData.purchasedPrice,
                    formData.sellingPrice,
                    formData.totalPurchased,
                    0,
                    0,
                    `=G${inventoryData.length + 2}*(E${inventoryData.length + 2}-D${inventoryData.length + 2})`,
                    formData.remark,
                ];
                await gapi.client.sheets.spreadsheets.values.append({
                    spreadsheetId: SPREADSHEET_ID,
                    range: INVENTORY_SHEET,
                    valueInputOption: 'USER_ENTERED',
                    values: [newRow],
                });
            }
            alert('Inventory updated successfully!');
            fetchSheetData();
            closeFormModal();
        } catch (error) {
            console.error('Add Inventory error:', error);
            alert('Failed to add inventory: ' + error.message);
        }
    });
}

function showAddInventoryForm() {
    DOM.formContent.innerHTML = getAddInventoryForm();
    DOM.formModal.style.display = 'flex';
    setupAddInventoryForm(); // Call setup after rendering
}

// New Sale Form
function getNewSaleForm() {
    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).split('/').join('-');
    const nextOrderId = generateNextOrderId();
    return `
        <h2>New Sale</h2>
        <form id="newSaleForm">
            <div class="form-row">
                <div class="form-col">
                    <label for="orderId">Order ID:</label>
                    <input type="text" id="orderId" name="orderId" value="${nextOrderId}" readonly>
                </div>
                <div class="form-col">
                    <label for="orderDate">Order Date:</label>
                    <input type="text" id="orderDate" name="orderDate" required value="${today}" class="new-sale-date-picker">
                </div>
            </div>
            <div class="form-row">
                <div class="form-col">
                    <label for="customerName">Customer Name:</label>
                    <input type="text" id="customerName" name="customerName" required>
                </div>
                <div class="form-col">
                    <label for="phoneNo">Phone No.:</label>
                    <input type="text" id="phoneNo" name="phoneNo">
                </div>
            </div>
            <div class="form-group">
                <label for="address">Address:</label>
                <textarea id="address" name="address" rows="2"></textarea>
            </div>
            <div class="form-row">
                <div class="form-col">
                    <label for="contactMethod">Contact Method:</label>
                    <select id="contactMethod" name="contactMethod">
                        <option value="Telegram">Telegram</option>
                        <option value="Viber">Viber</option>
                        <option value="TikTok">TikTok</option>
                        <option value="Messenger">Messenger</option>
                    </select>
                </div>
                <div class="form-col">
                    <label for="accountName">Account Name:</label>
                    <input type="text" id="accountName" name="accountName">
                </div>
            </div>
            <div class="form-row">
                <div class="form-col">
                    <label for="itemPurchased">Item Purchased:</label>
                    <select id="itemPurchased" name="itemPurchased" required onchange="updateSellingPrice()">
                        <option value="">-- Select an Item --</option>
                        ${inventoryData.map(item => `<option value="${item.item_name}" data-price="${item.selling_price}">${item.item_name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-col">
                    <label for="sellingPrice">Selling Price:</label>
                    <input type="number" id="sellingPrice" name="sellingPrice" required min="0" step="0.01">
                </div>
            </div>
            <div class="form-row">
                <div class="form-col">
                    <label for="quantitySold">Quantity Sold:</label>
                    <input type="number" id="quantitySold" name="quantitySold" required min="1" value="1" onchange="updateTotalValue()">
                </div>
                <div class="form-col">
                    <label for="totalValue">Total Value:</label>
                    <input type="number" id="totalValue" name="totalValue" readonly>
                </div>
            </div>
            <div class="form-row">
                <div class="form-col">
                    <label for="paymentStatus">Payment Status:</label>
                    <select id="paymentStatus" name="paymentStatus" required>
                        <option value="ပြီး">ပြီး</option>
                        <option value="မပြီး">မပြီး</option>
                    </select>
                </div>
                <div class="form-col">
                    <label for="paymentMethod">Payment Method:</label>
                    <select id="paymentMethod" name="paymentMethod">
                        <option value="KBZ Pay">KBZ Pay</option>
                        <option value="Wave Pay">Wave Pay</option>
                        <option value="Banking">Banking</option>
                        <option value="COD">COD</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-col">
                    <label for="paymentDate">Payment Date:</label>
                    <input type="text" id="paymentDate" name="paymentDate" class="new-sale-date-picker">
                </div>
                <div class="form-col">
                    <label for="discount">Discount:</label>
                    <input type="number" id="discount" name="discount" value="0" min="0" step="0.01" onchange="updateTotalValue()">
                </div>
            </div>
            <div class="form-row">
                <div class="form-col">
                    <label for="deliveryService">Delivery Service:</label>
                    <input type="text" id="deliveryService" name="deliveryService" value="Done">
                </div>
                <div class="form-col">
                    <label for="deliveryDate">Delivery Date:</label>
                    <input type="text" id="deliveryDate" name="deliveryDate" class="new-sale-date-picker">
                </div>
            </div>
            <div class="form-group">
                <label for="trackingNo">Tracking No.:</label>
                <input type="text" id="trackingNo" name="trackingNo">
            </div>
            <div class="form-group">
                <label for="remarks">Remarks:</label>
                <textarea id="remarks" name="remarks" rows="2"></textarea>
            </div>
            <div class="btn-container">
                <button type="button" class="glass-btn btn-secondary" onclick="closeFormModal()">Cancel</button>
                <button type="submit" class="glass-btn btn-primary">Submit</button>
            </div>
        </form>
    `;
}

function setupNewSaleForm() {
    function updateSellingPrice() {
        const select = document.getElementById('itemPurchased');
        const option = select.options[select.selectedIndex];
        const price = option ? parseFloat(option.getAttribute('data-price')) || 0 : 0;
        document.getElementById('sellingPrice').value = price;
        updateTotalValue();
    }

    function updateTotalValue() {
        const price = parseFloat(document.getElementById('sellingPrice').value) || 0;
        const quantity = parseInt(document.getElementById('quantitySold').value) || 0;
        const discount = parseFloat(document.getElementById('discount').value) || 0;
        const total = (price * quantity) - discount;
        document.getElementById('totalValue').value = total.toFixed(2);
    }

    document.getElementById('itemPurchased').addEventListener('change', updateSellingPrice);
    document.getElementById('quantitySold').addEventListener('change', updateTotalValue);
    document.getElementById('discount').addEventListener('change', updateTotalValue);

    // Initialize Flatpickr for all date fields in the form
    const datePickers = document.querySelectorAll('.new-sale-date-picker');
    datePickers.forEach(picker => {
        flatpickr(picker, {
            dateFormat: "d-m-Y",
            maxDate: "today",
            position: "below", // Default Flatpickr positioning below the input
            appendTo: document.body, // Append to body to avoid modal clipping
            onOpen: function(selectedDates, dateStr, instance) {
                console.log('Opening calendar for:', picker.id); // Debug
                instance.calendarContainer.style.zIndex = '3000'; // Above modal
            },
            onReady: function(selectedDates, dateStr, instance) {
                // Ensure no custom styling is applied
                instance.calendarContainer.classList.remove('new-sale-calendar');
            }
        });
    });

    document.getElementById('newSaleForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = {
            orderId: document.getElementById('orderId').value,
            orderDate: document.getElementById('orderDate').value,
            customerName: document.getElementById('customerName').value,
            phoneNo: document.getElementById('phoneNo').value,
            address: document.getElementById('address').value,
            contactMethod: document.getElementById('contactMethod').value,
            accountName: document.getElementById('accountName').value,
            itemPurchased: document.getElementById('itemPurchased').value,
            sellingPrice: parseFloat(document.getElementById('sellingPrice').value),
            quantitySold: parseInt(document.getElementById('quantitySold').value),
            totalValue: parseFloat(document.getElementById('totalValue').value),
            paymentStatus: document.getElementById('paymentStatus').value,
            paymentMethod: document.getElementById('paymentMethod').value,
            paymentDate: document.getElementById('paymentDate').value || '',
            deliveryService: document.getElementById('deliveryService').value,
            deliveryDate: document.getElementById('deliveryDate').value || '',
            trackingNo: document.getElementById('trackingNo').value,
            discount: parseFloat(document.getElementById('discount').value),
            remarks: document.getElementById('remarks').value,
        };

        if (!formData.itemPurchased) {
            alert('Please select an item');
            return;
        }
        if (!formData.customerName) {
            alert('Please enter customer name');
            return;
        }

        const convertDate = (dateStr) => {
            if (!dateStr) return '';
            const [day, month, year] = dateStr.split('-');
            return `${year}-${month}-${day}`;
        };

        try {
            const newRow = [
                formData.orderId,
                convertDate(formData.orderDate),
                formData.customerName,
                formData.phoneNo,
                formData.address,
                formData.contactMethod,
                formData.accountName,
                formData.itemPurchased,
                formData.sellingPrice,
                formData.quantitySold,
                formData.totalValue,
                formData.paymentStatus,
                formData.paymentMethod,
                convertDate(formData.paymentDate),
                formData.deliveryService,
                convertDate(formData.deliveryDate),
                formData.trackingNo,
                formData.discount,
                formData.remarks,
            ];
            await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: SALES_SHEET,
                valueInputOption: 'USER_ENTERED',
                values: [newRow],
            });

            const itemIndex = inventoryData.findIndex(item => item.item_name === formData.itemPurchased);
            if (itemIndex !== -1) {
                const rowIndex = itemIndex + 2;
                const currentSold = parseInt(inventoryData[itemIndex].total_sold) || 0;
                await gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${INVENTORY_SHEET}!G${rowIndex}`,
                    valueInputOption: 'USER_ENTERED',
                    values: [[currentSold + formData.quantitySold]],
                });
            }

            alert('Sale recorded successfully!');
            fetchSheetData();
            closeFormModal();
        } catch (error) {
            console.error('New Sale error:', error);
            alert('Failed to record sale: ' + error.message);
        }
    });
}

function generateNextOrderId() {
    const currentYear = new Date().getFullYear();
    const prefix = `sale_${currentYear}_`;
    if (!salesData.length) return prefix + '0001';
    const lastOrder = salesData
        .filter(sale => sale.order_id && sale.order_id.startsWith(prefix))
        .sort((a, b) => b.order_id.localeCompare(a.order_id))[0]?.order_id;
    if (!lastOrder) return prefix + '0001';
    const counter = parseInt(lastOrder.substring(prefix.length)) + 1;
    return prefix + ('0000' + counter).slice(-4);
}

// Cancel/Return Form
function getCancelReturnForm() {
    return `
        <h2>Cancel/Return Sale</h2>
        <div class="form-group">
            <label for="orderIdInput">Order ID:</label>
            <input type="text" id="orderIdInput" placeholder="e.g., sale_2025_0001">
            <div id="orderIdError" class="error"></div>
        </div>
        <div class="btn-container">
            <button type="button" class="glass-btn btn-secondary" onclick="closeFormModal()">Cancel</button>
            <button type="button" class="glass-btn btn-primary" onclick="searchOrder()">Search</button>
        </div>
        <div id="saleDetails" style="display: none;">
            <input type="hidden" id="orderId" name="orderId">
            <input type="hidden" id="rowIndex" name="rowIndex">
            <div class="form-group">
                <label for="action">Action:</label>
                <select id="action" name="action" required>
                    <option value="Cancel">Cancel</option>
                    <option value="Return">Return</option>
                </select>
            </div>
            <div class="form-group">
                <label for="reason">Reason:</label>
                <select id="reason" name="reason" required>
                    <option value="Customer Request">Customer Request</option>
                    <option value="Wrong Item">Wrong Item</option>
                    <option value="Other">Other</option>
                </select>
            </div>
            <div class="btn-container">
                <button type="button" class="glass-btn btn-secondary" onclick="goBack()">Back</button>
                <button type="button" class="glass-btn btn-primary" id="processButton" onclick="processCancelReturn()">Process</button>
            </div>
        </div>
    `;
}

function setupCancelReturnForm() {
    let orderFound = false;

    window.searchOrder = function() {
        const orderId = document.getElementById('orderIdInput').value.trim();
        const orderIdError = document.getElementById('orderIdError');
        orderIdError.textContent = '';

        if (!orderId) {
            orderIdError.textContent = 'Please enter an Order ID.';
            return;
        }

        const sale = salesData.find(s => s.order_id === orderId);
        if (sale) {
            orderFound = true;
            document.getElementById('orderId').value = sale.order_id;
            document.getElementById('rowIndex').value = salesData.indexOf(sale) + 2;
            document.getElementById('saleDetails').style.display = 'block';
            document.getElementById('orderIdInput').disabled = true;
            document.getElementById('processButton').disabled = false;
        } else {
            orderFound = false;
            orderIdError.textContent = 'Order ID not found.';
            document.getElementById('saleDetails').style.display = 'none';
            document.getElementById('processButton').disabled = true;
        }
    };

    window.goBack = function() {
        orderFound = false;
        document.getElementById('saleDetails').style.display = 'none';
        document.getElementById('orderIdInput').disabled = false;
        document.getElementById('orderIdInput').value = '';
        document.getElementById('orderIdError').textContent = '';
        document.getElementById('processButton').disabled = true;
    };

    window.processCancelReturn = async function() {
        if (!orderFound) {
            alert('Please search for a valid Order ID before proceeding.');
            return;
        }

        const formData = {
            orderId: document.getElementById('orderId').value,
            rowIndex: parseInt(document.getElementById('rowIndex').value),
            action: document.getElementById('action').value,
            reason: document.getElementById('reason').value,
        };

        try {
            const sale = salesData[formData.rowIndex - 2];
            const remarks = (sale.remarks || '').toLowerCase();
            if (remarks.includes('cancel') || remarks.includes('return')) {
                alert('This order has already been canceled or returned.');
                return;
            }

            const newRemark = `${sale.remarks ? sale.remarks + ' - ' : ''}${formData.action} on ${new Date().toISOString().split('T')[0]} (${formData.reason})`;
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SALES_SHEET}!S${formData.rowIndex}`,
                valueInputOption: 'USER_ENTERED',
                values: [[newRemark]],
            });

            const itemIndex = inventoryData.findIndex(item => item.item_name === sale.item_purchased);
            if (itemIndex !== -1) {
                const invRowIndex = itemIndex + 2;
                const currentSold = parseInt(inventoryData[itemIndex].total_sold) || 0;
                const newSold = currentSold - parseInt(sale.quantity_sold);
                if (newSold >= 0) {
                    await gapi.client.sheets.spreadsheets.values.update({
                        spreadsheetId: SPREADSHEET_ID,
                        range: `${INVENTORY_SHEET}!G${invRowIndex}`,
                        valueInputOption: 'USER_ENTERED',
                        values: [[newSold]],
                    });
                }
            }

            alert(`${formData.action} processed successfully!`);
            fetchSheetData();
            closeFormModal();
        } catch (error) {
            console.error('Cancel/Return error:', error);
            alert('Failed to process cancel/return: ' + error.message);
        }
    };
}

// Existing Functions (unchanged or slightly modified)
function setupEventListeners() {
    DOM.searchBtn.addEventListener('click', handleSearch);
    DOM.resetBtn.addEventListener('click', resetSearch);
    DOM.viewHistoryBtn.addEventListener('click', updateDashboardSummary);
    DOM.closeModal.addEventListener('click', () => {
        DOM.modal.style.display = 'none';
    });

    // Prevent scroll propagation for all modals (from previous fix)
    [DOM.modal, DOM.formModal].forEach(modal => {
        modal.addEventListener('wheel', (e) => {
            const modalContent = modal.querySelector('.glass-modal');
            if (modalContent.scrollHeight > modalContent.clientHeight) {
                e.preventDefault();
                modalContent.scrollTop += e.deltaY;
            }
        });
    });

    window.addEventListener('click', (event) => {
        if (event.target === DOM.modal) {
            DOM.modal.style.display = 'none';
        }
        if (event.target === DOM.formModal) {
            closeFormModal();
        }
    });

    document.getElementById('customerSearch').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleSearch();
        }
    });

    document.getElementById('orderIdSearch').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleSearch();
        }
    });

    const today = new Date();
    const startDatePicker = flatpickr("#startDate", {
        dateFormat: "d-m-Y",
        maxDate: today,
        defaultDate: document.getElementById('startDate').value || null,
        disable: [date => date > today],
        onOpen: function(selectedDates, dateStr, instance) {
            instance.calendarContainer.style.width = '308px'; // Match CSS
        },
        onReady: function(selectedDates, dateStr, instance) {
            instance.days.style.width = '308px'; // Ensure days container fits 7 days
            instance.days.style.gridTemplateColumns = 'repeat(7, 1fr)'; // Force 7 columns
        },
        onChange: function(selectedDates, dateStr, instance) {
            endDatePicker.set('minDate', selectedDates[0]);
        }
    });

    const endDatePicker = flatpickr("#endDate", {
        dateFormat: "d-m-Y",
        maxDate: today,
        defaultDate: document.getElementById('endDate').value || null,
        disable: [date => date > today],
        onOpen: function(selectedDates, dateStr, instance) {
            instance.calendarContainer.style.width = '308px'; // Match CSS
        },
        onReady: function(selectedDates, dateStr, instance) {
            instance.days.style.width = '308px'; // Ensure days container fits 7 days
            instance.days.style.gridTemplateColumns = 'repeat(7, 1fr)'; // Force 7 columns
        },
        onChange: function(selectedDates, dateStr, instance) {
            startDatePicker.set('maxDate', selectedDates[0]);
        }
    });
}

function setDefaultDateRange() {
    const today = new Date();
    document.getElementById('endDate').value = today.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).split('/').join('-');
    const oneMonthAgo = new Date(today);
    oneMonthAgo.setMonth(today.getMonth() - 1);
    document.getElementById('startDate').value = oneMonthAgo.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).split('/').join('-');
}

function handleSearch() {
    if (!isDataLoaded) return;
    showLoader();
    const orderId = document.getElementById('orderIdSearch').value.trim().toLowerCase();
    const customerName = document.getElementById('customerSearch').value.trim().toLowerCase();
    const startDateStr = document.getElementById('startDate').value.trim();
    const endDateStr = document.getElementById('endDate').value.trim();

    let filteredResults = [...salesData];

    if (orderId) {
        filteredResults = filteredResults.filter(sale => 
            (sale.order_id || '').toLowerCase().includes(orderId)
        );
    }

    if (customerName) {
        filteredResults = filteredResults.filter(sale => 
            (sale.customer_name || '').toLowerCase().includes(customerName)
        );
    }

    const parseDate = (dateStr) => {
        if (!dateStr) return null;
        const [day, month, year] = dateStr.split('-');
        if (!day || !month || !year) return null;
        return new Date(year, month - 1, day);
    };

    if (startDateStr) {
        const start = parseDate(startDateStr);
        if (start) {
            filteredResults = filteredResults.filter(sale => {
                if (!sale.order_date) return false;
                return new Date(sale.order_date) >= start;
            });
        }
    }

    if (endDateStr) {
        const end = parseDate(endDateStr);
        if (end) {
            end.setHours(23, 59, 59);
            filteredResults = filteredResults.filter(sale => {
                if (!sale.order_date) return false;
                return new Date(sale.order_date) <= end;
            });
        }
    }

    // Sort by order_id in descending order
    filteredResults.sort((a, b) => {
        if (!a.order_id || !b.order_id) return 0;
        return b.order_id.localeCompare(a.order_id); // Descending order
    });

    displaySearchResults(filteredResults);
}

function displaySearchResults(results) {
    const tableBody = DOM.resultsTable.querySelector('tbody');
    const paginationContainer = document.getElementById('pagination');
    tableBody.innerHTML = '';
    paginationContainer.innerHTML = '';

    if (!results.length) {
        hideLoader();
        DOM.noResults.classList.remove('hidden');
        DOM.resultsTable.classList.add('hidden');
        paginationContainer.classList.add('hidden');
        return;
    }

    DOM.noResults.classList.add('hidden');
    DOM.resultsTable.classList.remove('hidden');
    paginationContainer.classList.remove('hidden');

    results.sort((a, b) => {
        if (!a.order_date) return 1;
        if (!b.order_date) return -1;
        return new Date(b.order_date) - new Date(a.order_date);
    });

    const rowsPerPage = 10;
    const totalRows = results.length;
    const totalPages = Math.ceil(totalRows / rowsPerPage);
    let currentPage = 1;

    function renderPage(page) {
        tableBody.innerHTML = '';
        const startIndex = (page - 1) * rowsPerPage;
        const endIndex = Math.min(startIndex + rowsPerPage, totalRows);

        for (let i = startIndex; i < endIndex; i++) {
            const sale = results[i];
            const tr = document.createElement('tr');
            const formattedDate = sale.order_date
                ? new Date(sale.order_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                : 'N/A';

            const remarks = (sale.remarks || '').toLowerCase();
            const isCancelledOrReturned = remarks.includes('cancel') || remarks.includes('return');
            if (isCancelledOrReturned) {
                tr.classList.add('cancelled-row');
            }

            tr.innerHTML = `
                <td class="sale-info">${sale.order_id || 'N/A'}</td>
                <td class="sale-info">${formattedDate}</td>
                <td class="sale-info">${sale.customer_name || 'N/A'}</td>
                <td class="sale-info">${sale.item_purchased || 'N/A'}</td>
                <td class="sale-info">${sale.total_value ? `${sale.total_value} MMK` : 'N/A'}</td>
                <td class="sale-info">${sale.payment_status || 'N/A'}</td>
                <td><button class="view-details" data-id="${sale.order_id}">View</button></td>
            `;
            tableBody.appendChild(tr);
        }

        document.querySelectorAll('.view-details').forEach(button => {
            button.addEventListener('click', () => {
                const orderId = button.getAttribute('data-id');
                showOrderDetails(orderId);
            });
        });
    }

    function renderPagination() {
        paginationContainer.innerHTML = '';

        const prevButton = document.createElement('button');
        prevButton.innerHTML = '<i class="fas fa-arrow-left"></i>';
        prevButton.className = 'pagination-btn';
        prevButton.disabled = currentPage === 1;
        prevButton.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderPage(currentPage);
                renderPagination();
            }
        });
        paginationContainer.appendChild(prevButton);

        for (let i = 1; i <= totalPages; i++) {
            const pageButton = document.createElement('button');
            pageButton.textContent = i;
            pageButton.className = 'pagination-btn' + (i === currentPage ? ' active' : '');
            pageButton.addEventListener('click', () => {
                currentPage = i;
                renderPage(currentPage);
                renderPagination();
            });
            paginationContainer.appendChild(pageButton);
        }

        const nextButton = document.createElement('button');
        nextButton.innerHTML = '<i class="fas fa-arrow-right"></i>';
        nextButton.className = 'pagination-btn';
        nextButton.disabled = currentPage === totalPages;
        nextButton.addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage++;
                renderPage(currentPage);
                renderPagination();
            }
        });
        paginationContainer.appendChild(nextButton);
    }

    renderPage(currentPage);
    renderPagination();
    hideLoader();
}

// Show order details in modal
function showOrderDetails(orderId) {
    const order = salesData.find(sale => sale.order_id === orderId);
    if (!order) return;

    const formatDate = (date) => {
        if (!date) return 'N/A';
        return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    };

    const detailsElement = document.getElementById('orderDetails');
    detailsElement.innerHTML = `
        <div class="order-info">
            <div class="order-info-group">
                <h4>Order Information</h4>
                <p><strong>Order ID:</strong> ${order.order_id || 'N/A'}</p>
                <p><strong>Order Date:</strong> ${formatDate(order.order_date)}</p>
                <p><strong>Payment Status:</strong> ${order.payment_status || 'N/A'}</p>
                <p><strong>Payment Method:</strong> ${order.payment_method || 'N/A'}</p>
                <p><strong>Payment Date:</strong> ${formatDate(order.payment_date)}</p>
            </div>
            <div class="order-info-group">
                <h4>Customer Information</h4>
                <p><strong>Name:</strong> ${order.customer_name || 'N/A'}</p>
                <p><strong>Phone:</strong> ${order.phone_no || 'N/A'}</p>
                <p><strong>Address:</strong> ${order.address || 'N/A'}</p>
                <p><strong>Contact Method:</strong> ${order.contact_method || 'N/A'}</p>
                <p><strong>Account Name:</strong> ${order.account_name || 'N/A'}</p>
            </div>
        </div>
        <div class="order-info">
            <div class="order-info-group">
                <h4>Delivery Information</h4>
                <p><strong>Delivery Service:</strong> ${order.delivery_service || 'N/A'}</p>
                <p><strong>Delivery Date:</strong> ${formatDate(order.delivery_date)}</p>
                <p><strong>Tracking No:</strong> ${order.tracking_no || 'N/A'}</p>
            </div>
            <div class="order-info-group">
                <h4>Additional Information</h4>
                <p><strong>Discount:</strong> ${order.discount || 'None'}</p>
                <p><strong>Remarks:</strong> ${order.remarks || 'None'}</p>
            </div>
        </div>
        <div class="order-items">
            <h4>Order Items</h4>
            <div class="order-item">
                <span>${order.item_purchased || 'Unknown Item'}</span>
                <span>${order.quantity_sold || '1'} × ${order.selling_price || '0'} MMK</span>
            </div>
            <div class="order-total">
                <span>Total:</span>
                <span>${order.total_value || '0'} MMK</span>
            </div>
        </div>
    `;

    DOM.modal.style.display = 'block';
}

function resetSearch() {
    document.getElementById('orderIdSearch').value = '';
    document.getElementById('customerSearch').value = '';
    setDefaultDateRange();
    DOM.resultsTable.querySelector('tbody').innerHTML = '';
    DOM.noResults.classList.add('hidden');
    DOM.resultsTable.classList.add('hidden');
    document.getElementById('pagination').classList.add('hidden');
}
