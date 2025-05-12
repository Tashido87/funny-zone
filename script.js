// Google Sheets API Configuration
const API_KEY = 'AIzaSyAztNSJf-fBpvsCfrv8x7oR2ViLKRLQErc';
const CLIENT_ID = '609536649533-ta5o3b6d1dgess21sedlr2arsr8ms1h6.apps.googleusercontent.com';
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
let monthlySalesChartInstance = null;
let inventoryChartInstance = null;
let currentPage = 1;
const ITEMS_PER_PAGE = 10;

// DOM elements
const DOM = {
    loader: document.getElementById('loader'),
    noResults: document.getElementById('noResults'),
    resultsTable: document.getElementById('resultsTable'),
    searchBtn: document.getElementById('searchBtn'),
    resetBtn: document.getElementById('resetBtn'),
    modal: document.getElementById('orderDetailsModal'),
    closeModal: document.querySelector('#orderDetailsModal .close'),
    totalSales: document.getElementById('totalSales'),
    totalProfit: document.getElementById('totalProfit'),
    salesChange: document.getElementById('salesChange'),
    profitChange: document.getElementById('profitChange'),
    inventoryCount: document.getElementById('inventoryCount'),
    lowStockCount: document.getElementById('lowStockCount'),
    inventoryBar: document.getElementById('inventoryBar'),
    availablePercent: document.getElementById('availablePercent'),
    soldPercent: document.getElementById('soldPercent'),
    topItemName: document.getElementById('topItemName'),
    topItemCode: document.getElementById('topItemCode'),
    topItemSold: document.getElementById('topItemSold'),
    topItemProfit: document.getElementById('topItemProfit'),
    topItemChange: document.getElementById('topItemChange'),
    formModal: document.getElementById('formModal'),
    formContent: document.getElementById('formContent'),
    formTitle: document.getElementById('formTitle'),
    receiptModal: document.getElementById('receiptModal'),
    receiptContent: document.getElementById('receiptContent'),
    inventoryModal: document.getElementById('inventoryModal'),
    inventoryDetails: document.getElementById('inventoryDetails'),
    chartYear: document.getElementById('chartYear'),
    pagination: document.getElementById('pagination'),
};

// Utility functions
const formatNumberWithCommas = (number) => {
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const showLoader = () => DOM.loader.classList.remove('hidden');
const hideLoader = () => DOM.loader.classList.add('hidden');

const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}-${month}-${year}`;
};

// Sanitize customer input to ensure consistency (remove extra spaces and special characters)
function sanitizeString(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/[\0-\x1F\x7F-\x9F]/g, '') // Remove control characters
        .replace(/[\n\r\t]/g, ' ') // Replace newlines and tabs with spaces
        .replace(/\s+/g, ' ') // Collapse multiple spaces into a single space
        .replace(/[\u200B-\u200F\uFEFF]/g, '') // Remove zero-width spaces and non-breaking spaces
        .replace(/[^\u1000-\u109F\w\s.,\/-]/g, '') // Keep Burmese script, letters, numbers, spaces, and common punctuation
        .trim(); // Remove leading/trailing spaces
}

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
        gapiInited = true;
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (response) => {
                if (response.access_token) {
                    gapi.client.setToken({ access_token: response.access_token });
                    document.getElementById('loginButton').classList.add('hidden');
                    document.getElementById('logoutButton').classList.remove('hidden');
                    fetchSheetData();
                } else {
                    alert('Authentication failed. Please try again.');
                }
            },
        });
        tokenClient.requestAccessToken();
    } catch (error) {
        alert('Failed to initialize Google API client: ' + error.message);
    }
}

// Advanced function to generate distinct and vibrant colors across the color wheel
function generateColorForItem(index, totalItems) {
    // Increase the separation in hues by a larger step (30-50)
    const hue = (index * 50) % 360;  // Rotate hues more significantly to ensure strong difference
    const saturation = 60 + Math.floor(Math.random() * 40); // Saturation between 60% and 100% for bright, saturated colors
    const lightness = 40 + Math.floor(Math.random() * 40);  // Lightness between 40% and 80% for contrast

    // Return the HSL color string
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}


// Global color map to ensure consistent colors across chart types
const colorMap = {};

// Function to get a color for an item, cycling or generating new colors if needed
function getColorForItem(item, index, colorMap) {
    if (colorMap[item]) {
        return colorMap[item]; // Return existing color for consistency
    }
    // Assign a color from the palette, cycling if necessary
    const color = COLOR_PALETTE[index % COLOR_PALETTE.length];
    colorMap[item] = color; // Store in colorMap for consistency
    return color;
}

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', async () => {
    showLoader();
    loadGapi();
    try {
        setupEventListeners();
        setupYearSelector();
        initializeCharts();
        setDefaultDateRange();
    } catch (error) {
        alert('Failed to initialize. Please check your connection and try again.');
    }
});

// Fetch data from Google Sheets
async function fetchSheetData() {
    if (!gapiInited) return;
    showLoader();
    try {
        const fetchData = async (sheet) => {
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: sheet,
            });
            const result = response.result;
            if (!result.values || result.values.length <= 1) return [];
            const headers = result.values[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
            console.log(`Headers for ${sheet}:`, headers); // Debug: Log headers
            return result.values.slice(1).map(row => {
                const item = {};
                headers.forEach((header, index) => {
                    item[header] = row[index] || '';
                });
                // Debug: Log discount specifically for Sale_Log
                if (sheet === SALES_SHEET) {
                    console.log(`Sale row - Order ID: ${item.order_id}, Discount: ${item.discount}`);
                }
                return item;
            });
        };

        inventoryData = await fetchData(INVENTORY_SHEET);
        salesData = await fetchData(SALES_SHEET);
        isDataLoaded = true;
        updateDashboard();
        updateInventoryModal();
        handleSearch();
    } catch (error) {
        alert('Failed to load data: ' + error.message);
    } finally {
        hideLoader();
    }
}

// Setup year and month selector
function setupYearSelector() {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // 1-12
    const yearSelect = DOM.chartYear;
    yearSelect.innerHTML = ''; // Clear existing options
    for (let year = currentYear; year >= currentYear - 5; year--) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearSelect.appendChild(option);
    }
    yearSelect.value = currentYear;

    // Add month selector
    const monthSelect = document.createElement('select');
    monthSelect.id = 'chartMonth';
    monthSelect.className = 'bg-gray-800/50 text-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    months.forEach((month, index) => {
        const option = document.createElement('option');
        option.value = index + 1;
        option.textContent = month;
        monthSelect.appendChild(option);
    });
    monthSelect.value = currentMonth;
    yearSelect.parentNode.insertBefore(monthSelect, yearSelect.nextSibling);

    yearSelect.addEventListener('change', updateDashboard);
    monthSelect.addEventListener('change', updateDashboard);
}

// Initialize charts
function initializeCharts() {
    // Profit Chart
    const profitOptions = {
        series: [{ name: 'Profit', data: [] }],
        chart: {
            type: 'area',
            sparkline: { enabled: true },
            toolbar: { show: false },
        },
        colors: ['#1e88e5'],
        fill: {
            type: 'gradient',
            gradient: { shadeIntensity: 1, opacityFrom: 0.7, opacityTo: 0.3 },
        },
        stroke: { curve: 'smooth', width: 2 },
        tooltip: { enabled: false },
    };
    new ApexCharts(document.querySelector("#profitChart"), profitOptions).render();

    // Sales Chart
    const salesOptions = {
        series: [{ name: 'Sales', data: [] }],
        chart: {
            type: 'line',
            sparkline: { enabled: true },
            toolbar: { show: false },
        },
        colors: ['#00acc1'],
        stroke: { curve: 'smooth', width: 2 },
        tooltip: { enabled: false },
    };
    new ApexCharts(document.querySelector("#salesChart"), salesOptions).render();

    // Monthly Sales Chart
    monthlySalesChartInstance = new Chart(document.getElementById('monthlySalesChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
            datasets: [{
                label: 'Sales (MMK)',
                data: [],
                borderColor: '#1e88e5',
                backgroundColor: 'rgba(30, 136, 229, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(10, 25, 47, 0.9)',
                    titleColor: '#e3f2fd',
                    bodyColor: '#e3f2fd',
                    borderColor: 'rgba(31, 38, 135, 0.3)',
                    borderWidth: 1,
                    callbacks: {
                        label: context => ` ${context.parsed.y.toLocaleString()} MMK`,
                    },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: '#e3f2fd',
                        callback: value => (value / 1000000) + 'M',
                    },
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#e3f2fd' },
                },
            },
        },
    });

    // Inventory Chart
    inventoryChartInstance = new Chart(document.getElementById('inventoryChart').getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: ['rgba(30, 136, 229, 0.8)', 'rgba(0, 172, 193, 0.8)', 'rgba(124, 77, 255, 0.8)', 'rgba(255, 193, 7, 0.8)', 'rgba(233, 30, 99, 0.8)'],
                borderColor: 'rgba(10, 25, 47, 0.8)',
                borderWidth: 2,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#e3f2fd', padding: 20, usePointStyle: true, pointStyle: 'circle' },
                },
                tooltip: {
                    backgroundColor: 'rgba(10, 25, 47, 0.9)',
                    titleColor: '#e3f2fd',
                    bodyColor: '#e3f2fd',
                    borderColor: 'rgba(31, 38, 135, 0.3)',
                    borderWidth: 1,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = Math.round((value / total) * 100);
                            const chartType = document.querySelector('.category-toggle.active')?.dataset.type || 'category';
                            if (chartType === 'profit') {
                                return `${label}: ${formatNumberWithCommas(value)} MMK (${percentage}%)`;
                            }
                            return `${label}: ${value} items (${percentage}%)`;
                        },
                    },
                },
            },
            cutout: '70%',
            animation: { animateScale: true, animateRotate: true },
        },
    });
}

// Update dashboard
function updateDashboard() {
    if (!salesData.length || !inventoryData.length) {
        resetDashboard();
        return;
    }

    const selectedYear = parseInt(DOM.chartYear.value);
    const selectedMonth = parseInt(document.getElementById('chartMonth').value);
    
    // Filter sales for the selected month and year for Total Sales and Total Profit
    const selectedSales = salesData.filter(sale => {
        const saleDate = new Date(sale.order_date);
        const remarks = (sale.remarks || '').toLowerCase();
        return (
            saleDate.getFullYear() === selectedYear &&
            saleDate.getMonth() + 1 === selectedMonth &&
            !remarks.includes('cancel') &&
            !remarks.includes('return')
        );
    });

    // Calculate Total Sales and Total Profit for the selected month
    const totalSalesValue = Math.floor(selectedSales.reduce((total, sale) => total + (parseFloat(sale.total_value) || 0), 0));
    const totalProfit = Math.floor(selectedSales.reduce((total, sale) => {
        const sellingPrice = parseFloat(sale.selling_price) || 0;
        const quantitySold = parseInt(sale.quantity_sold) || 0;
        const itemName = sale.item_purchased || '';
        const inventoryItem = inventoryData.find(item => item.item_name === itemName);
        const purchasedPrice = inventoryItem ? (parseFloat(inventoryItem.purchased_price) || 0) : 0;
        return total + (sellingPrice - purchasedPrice) * quantitySold;
    }, 0));

    // Calculate previous month's sales for comparison
    const prevMonthSales = salesData.filter(sale => {
        const saleDate = new Date(sale.order_date);
        const remarks = (sale.remarks || '').toLowerCase();
        let prevYear = selectedYear;
        let prevMonth = selectedMonth - 1;
        if (prevMonth === 0) {
            prevMonth = 12;
            prevYear -= 1;
        }
        return (
            saleDate.getFullYear() === prevYear &&
            saleDate.getMonth() + 1 === prevMonth &&
            !remarks.includes('cancel') &&
            !remarks.includes('return')
        );
    });

    const prevSalesValue = prevMonthSales.reduce((total, sale) => total + (parseFloat(sale.total_value) || 0), 0);
    const salesChange = prevSalesValue === 0 ? (totalSalesValue > 0 ? 100 : 0) : ((totalSalesValue - prevSalesValue) / prevSalesValue) * 100;

    // Update Total Sales and Total Profit DOM elements
    DOM.totalSales.textContent = `${formatNumberWithCommas(totalSalesValue)} MMK`;
    DOM.totalProfit.textContent = `${formatNumberWithCommas(totalProfit)} MMK`;
    DOM.salesChange.innerHTML = `${salesChange >= 0 ? '↑' : '↓'} ${Math.abs(salesChange).toFixed(1)}%`;
    DOM.profitChange.innerHTML = `${salesChange >= 0 ? '↑' : '↓'} ${Math.abs(salesChange).toFixed(1)}%`;
    DOM.salesChange.className = `text-${salesChange >= 0 ? 'green' : 'red'}-400 text-sm mt-2`;
    DOM.profitChange.className = `text-${salesChange >= 0 ? 'green' : 'red'}-400 text-sm mt-2`;

    // Inventory Status
    const totalItems = inventoryData.length;
    const lowStockItems = inventoryData.filter(item => {
        const remaining = parseInt(item.remaining) || 0;
        return remaining > 0 && remaining <= 5;
    }).length;
    const totalStock = inventoryData.reduce((sum, item) => sum + (parseInt(item.remaining) || 0), 0);
    const totalPurchased = inventoryData.reduce((sum, item) => sum + (parseInt(item.total_purchased) || 0), 0);
    const availablePercent = totalPurchased ? (totalStock / totalPurchased) * 100 : 0;

    DOM.inventoryCount.textContent = `${totalItems} Items`;
    DOM.lowStockCount.textContent = `${lowStockItems} items low stock`;
    DOM.inventoryBar.style.width = `${availablePercent}%`;
    DOM.availablePercent.textContent = `${Math.round(availablePercent)}% available`;
    DOM.soldPercent.textContent = `${Math.round(100 - availablePercent)}% sold`;

    // Top Selling Item
    const itemSales = {};
    selectedSales.forEach(sale => {
        const item = sale.item_purchased;
        if (item) {
            itemSales[item] = (itemSales[item] || 0) + (parseInt(sale.quantity_sold) || 0);
        }
    });
    const topItem = Object.entries(itemSales).sort((a, b) => b[1] - a[1])[0];
    if (topItem) {
        const itemName = topItem[0];
        const unitsSold = topItem[1];
        const inventoryItem = inventoryData.find(item => item.item_name === itemName);
        const profit = selectedSales
            .filter(sale => sale.item_purchased === itemName)
            .reduce((sum, sale) => {
                const sellingPrice = parseFloat(sale.selling_price) || 0;
                const purchasedPrice = inventoryItem ? (parseFloat(inventoryItem.purchased_price) || 0) : 0;
                return sum + (sellingPrice - purchasedPrice) * (parseInt(sale.quantity_sold) || 0);
            }, 0);
        DOM.topItemName.textContent = itemName;
        DOM.topItemCode.textContent = `Code: ${inventoryItem?.code_no || 'N/A'}`;
        DOM.topItemSold.textContent = `Sold: ${unitsSold} units`;
        DOM.topItemProfit.textContent = `${formatNumberWithCommas(Math.floor(profit))} MMK`;
        DOM.topItemChange.textContent = `+${Math.random() * 50 | 0}%`;
    } else {
        DOM.topItemName.textContent = 'None';
        DOM.topItemCode.textContent = 'Code: N/A';
        DOM.topItemSold.textContent = 'Sold: 0 units';
        DOM.topItemProfit.textContent = '0 MMK';
        DOM.topItemChange.textContent = '+0%';
    }

    // Update Monthly Sales Chart for the entire year
    const monthlySales = Array(12).fill(0);
    const yearSales = salesData.filter(sale => {
        const saleDate = new Date(sale.order_date);
        const remarks = (sale.remarks || '').toLowerCase();
        return (
            saleDate.getFullYear() === selectedYear &&
            !remarks.includes('cancel') &&
            !remarks.includes('return')
        );
    });

    yearSales.forEach(sale => {
        const month = new Date(sale.order_date).getMonth(); // 0-11
        monthlySales[month] += parseFloat(sale.total_value) || 0;
    });

    monthlySalesChartInstance.data.datasets[0].data = monthlySales;
    monthlySalesChartInstance.update();

    // Update Inventory Chart
    updateInventoryChart('category');
}

function updateInventoryChart(type) {
    let labels = [];
    let data = [];
    let colors = [];

    if (type === 'category') {
        const categories = {};
        inventoryData.forEach(item => {
            const category = item.category && item.category.trim() !== '' ? item.category : (item.item_name || 'Other');
            categories[category] = (categories[category] || 0) + (parseInt(item.remaining) || 0);
        });
        labels = Object.keys(categories);
        data = Object.values(categories);

        // Generate dynamic colors based on the number of categories
        colors = labels.map((_, index) => generateColorForItem(index, labels.length));
    } else if (type === 'profit') {
        const items = {};
        salesData.forEach(sale => {
            const remarks = (sale.remarks || '').toLowerCase();
            if (!remarks.includes('cancel') && !remarks.includes('return')) {
                const item = sale.item_purchased;
                const inventoryItem = inventoryData.find(i => i.item_name === item);
                const profit = ((parseFloat(sale.selling_price) || 0) - (inventoryItem ? (parseFloat(inventoryItem.purchased_price) || 0) : 0)) * (parseInt(sale.quantity_sold) || 0);
                items[item] = (items[item] || 0) + profit;
            }
        });
        labels = Object.keys(items);
        data = Object.values(items);

        // Generate dynamic colors based on the number of items
        colors = labels.map((_, index) => generateColorForItem(index, labels.length));
    }

    // Update the chart data with the generated colors
    inventoryChartInstance.data.labels = labels.length ? labels : ['No Data'];
    inventoryChartInstance.data.datasets[0].data = data.length ? data : [1];
    inventoryChartInstance.data.datasets[0].backgroundColor = colors.length ? colors : ['rgba(128, 128, 128, 0.8)']; // Fallback color
    inventoryChartInstance.update();
}


// Reset dashboard
function resetDashboard() {
    DOM.totalSales.textContent = '0 MMK';
    DOM.totalProfit.textContent = '0 MMK';
    DOM.salesChange.textContent = '↑ 0%';
    DOM.profitChange.textContent = '↑ 0%';
    DOM.inventoryCount.textContent = '0 Items';
    DOM.lowStockCount.textContent = '0 items low stock';
    DOM.inventoryBar.style.width = '0%';
    DOM.availablePercent.textContent = '0% available';
    DOM.soldPercent.textContent = '0% sold';
    DOM.topItemName.textContent = 'None';
    DOM.topItemCode.textContent = 'Code: N/A';
    DOM.topItemSold.textContent = 'Sold: 0 units';
    DOM.topItemProfit.textContent = '0 MMK';
    DOM.topItemChange.textContent = '+0%';
    monthlySalesChartInstance.data.datasets[0].data = Array(12).fill(0);
    monthlySalesChartInstance.update();
    inventoryChartInstance.data.labels = ['No Data'];
    inventoryChartInstance.data.datasets[0].data = [1];
    inventoryChartInstance.update();
}

// Inventory Modal
function toggleInventoryDetails() {
    DOM.inventoryModal.classList.toggle('hidden');
}

function closeInventoryModal() {
    DOM.inventoryModal.classList.add('hidden');
}

function updateInventoryModal() {
    DOM.inventoryDetails.innerHTML = '';
    if (!inventoryData.length) {
        DOM.inventoryDetails.innerHTML = '<p class="text-gray-400 text-center">No inventory data available.</p>';
        return;
    }

    inventoryData.forEach(item => {
        const remaining = parseInt(item.remaining) || 0;
        let stockClass = 'bg-green-500/20 text-green-400';
        let stockText = 'In Stock';
        if (remaining <= 0) {
            stockClass = 'bg-red-500/20 text-red-400';
            stockText = 'Out of Stock';
        } else if (remaining <= 5) { // Updated threshold to 5 units
            stockClass = 'bg-yellow-500/20 text-yellow-400';
            stockText = 'Low Stock';
        }

        const card = document.createElement('div');
        card.className = 'inventory-item';
        card.innerHTML = `
            <h4 class="text-blue-300 font-semibold">${item.item_name}</h4>
            <p class="text-gray-400 text-sm">Code: ${item.code_no || 'N/A'}</p>
            <p class="text-gray-400 text-sm">Purchase Price: ${formatNumberWithCommas(item.purchased_price || 0)} MMK</p>
            <p class="text-gray-400 text-sm">Selling Price: ${formatNumberWithCommas(item.selling_price || 0)} MMK</p>
            <p class="text-gray-400 text-sm">In Stock: ${remaining}</p>
            <p class="text-gray-400 text-sm">Profit: ${formatNumberWithCommas(item.profit || 0)} MMK</p>
            <span class="${stockClass} px-2 py-1 rounded-full text-xs mt-2 inline-block">${stockText}</span>
        `;
        DOM.inventoryDetails.appendChild(card);
    });
}

// Form Handling
function showForm(type) {
    if (!isDataLoaded) {
        alert('Data is still loading. Please wait.');
        return;
    }
    DOM.formModal.classList.remove('hidden');
    if (type === 'addInventory') {
        DOM.formTitle.textContent = 'Add Inventory';
        DOM.formContent.innerHTML = getAddInventoryForm();
        setupAddInventoryForm();
    } else if (type === 'newSale') {
        DOM.formTitle.textContent = 'New Sale';
        DOM.formContent.innerHTML = getNewSaleForm();
        setupNewSaleForm();
    } else if (type === 'cancelReturn') {
        DOM.formTitle.textContent = 'Cancel/Return Sale';
        DOM.formContent.innerHTML = getCancelReturnForm();
        setupCancelReturnForm();
    }
}

function closeFormModal() {
    DOM.formModal.classList.add('hidden');
    DOM.formContent.innerHTML = '';
}

// Add Inventory Form
function getAddInventoryForm() {
    return `
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
            <div id="newItemDiv" class="form-group hidden">
                <label for="newItem">New Item Name:</label>
                <input type="text" id="newItem" name="newItem">
            </div>
            <div class="form-group">
                <label for="codeNo">Code No. (Optional):</label>
                <input type="text" id="codeNo" name="codeNo">
            </div>
            <div class="form-group">
                <label for="purchasedPrice">Purchased Price:</label>
                <input type="text" id="purchasedPrice" name="purchasedPrice" required min="0" step="0.01">
            </div>
            <div class="form-group">
                <label for="sellingPrice">Selling Price:</label>
                <input type="text" id="sellingPrice" name="sellingPrice" required min="0" step="0.01">
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
                <button type="button" class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg" onclick="closeFormModal()">Cancel</button>
                <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">Submit</button>
            </div>
        </form>
    `;
}

function setupAddInventoryForm() {
    const existingBtn = document.getElementById('existingBtn');
    const newBtn = document.getElementById('newBtn');
    const existingDiv = document.getElementById('existingItemDiv');
    const newDiv = document.getElementById('newItemDiv');

    existingBtn.classList.add('active');
    newBtn.classList.remove('active');
    existingDiv.classList.remove('hidden');
    newDiv.classList.add('hidden');

    existingBtn.addEventListener('click', () => {
        existingBtn.classList.add('active');
        newBtn.classList.remove('active');
        existingDiv.classList.remove('hidden');
        newDiv.classList.add('hidden');
    });

    newBtn.addEventListener('click', () => {
        newBtn.classList.add('active');
        existingBtn.classList.remove('active');
        newDiv.classList.remove('hidden');
        existingDiv.classList.add('hidden');
    });

    document.getElementById('addInventoryForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const isExisting = existingBtn.classList.contains('active');
        const itemName = isExisting ? document.getElementById('existingItem').value : document.getElementById('newItem').value;

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
            alert('Failed to add inventory: ' + error.message);
        }
    });
}

// New Sale Form
function getNewSaleForm() {
    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).split('/').join('-');
    const nextOrderId = generateNextOrderId();
    return `
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
                    <label>Customer Type:</label>
                    <div class="btn-group mb-2">
                        <button type="button" id="newCustomerBtn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg mr-2 active">New Customer</button>
                        <button type="button" id="existingCustomerBtn" class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg">Existing Customer</button>
                    </div>
                    <label for="customerName">Customer Name:</label>
                    <div id="customerNameContainer">
                        <input type="text" id="customerName" name="customerName">
                    </div>
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
                <button type="button" class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg" onclick="closeFormModal()">Cancel</button>
                <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">Submit</button>
            </div>
        </form>
    `;
}

function setupNewSaleForm() {
    // State to track the current mode
    let customerMode = 'new'; // Default to 'new' (New Customer)
    let customerInputInstance = null; // To store the Choices.js instance

    // Elements
    const newCustomerBtn = document.getElementById('newCustomerBtn');
    const existingCustomerBtn = document.getElementById('existingCustomerBtn');
    const customerNameContainer = document.getElementById('customerNameContainer');

    // Function to clear related fields
    function clearCustomerFields() {
        document.getElementById('phoneNo').value = '';
        document.getElementById('address').value = '';
        document.getElementById('contactMethod').value = 'Telegram'; // Default value
        document.getElementById('accountName').value = '';
    }

    // Function to sanitize strings by removing invalid characters while preserving Burmese script
    function sanitizeString(str) {
        if (!str || typeof str !== 'string') return '';
        // Remove control characters, newlines, tabs, and emojis
        // Preserve Burmese script (U+1000 to U+109F) and other valid characters
        return str
            .replace(/[\0-\x1F\x7F-\x9F]/g, '') // Remove control characters
            .replace(/[\n\r\t]/g, ' ') // Replace newlines and tabs with spaces
            .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Remove emojis
            .replace(/[^\u1000-\u109F\p{L}\p{N}\s.,\/#!$%\^&\*;:{}=\-_`~()@+?><\[\]\+]/gu, '') // Keep Burmese, letters, numbers, spaces, and punctuation
            .trim(); // Remove leading/trailing spaces
    }

    // Function to set up the customer name input based on mode
    function setupCustomerInput() {
        // Destroy existing Choices.js instance if it exists
        if (customerInputInstance) {
            customerInputInstance.destroy();
            customerInputInstance = null;
        }

        // Clear the container
        customerNameContainer.innerHTML = '';

        if (customerMode === 'new') {
            // Plain text input for new customer
            customerNameContainer.innerHTML = `
                <input type="text" id="customerName" name="customerName">
            `;
            // Clear fields when switching to new customer mode
            clearCustomerFields();
            // Add input event to clear fields if the name is cleared
            const customerNameInput = document.getElementById('customerName');
            customerNameInput.addEventListener('input', () => {
                if (!customerNameInput.value) {
                    clearCustomerFields();
                }
            });
        } else {
            // Choices.js for existing customer
            customerNameContainer.innerHTML = `
                <select id="customerName" name="customerName" class="choices-select"></select>
            `;

            // Get the current date and calculate the date range (last 2 days)
            const today = new Date(); // Current date (e.g., April 13, 2025)
            const twoDaysAgo = new Date(today);
            twoDaysAgo.setDate(today.getDate() - 2); // Go back 2 days (e.g., April 11, 2025)
            twoDaysAgo.setHours(0, 0, 0, 0); // Start of the day
            const endOfToday = new Date(today);
            endOfToday.setHours(23, 59, 59, 999); // End of today

            // Filter salesData to include only orders from the last 2 days
            const recentSales = salesData.filter(sale => {
                const orderDate = new Date(sale.order_date);
                return orderDate >= twoDaysAgo && orderDate <= endOfToday;
            });

            // Group sales by customer (name, phone number, address)
            // Group sales by customer (name, phone number, address)
const customers = {};
recentSales.forEach(sale => {
    // Skip entries with missing or invalid customer_name
    if (!sale.customer_name || sale.customer_name.trim() === '') {
        console.warn('Skipping sale with missing customer_name:', sale);
        return;
    }

    // Sanitize customer data
    const sanitizedName = sanitizeString(sale.customer_name);
    const sanitizedPhone = sanitizeString(sale.phone_no || 'No Phone');
    const sanitizedAddress = sanitizeString(sale.address || 'No Address');

    // Log raw and sanitized values for debugging
    console.log('Raw customer_name:', sale.customer_name, 'Sanitized:', sanitizedName);
    console.log('Raw address:', sale.address, 'Sanitized:', sanitizedAddress);

    // Skip if sanitized name is empty
    if (!sanitizedName) {
        console.warn('Skipping sale with empty sanitized customer_name:', sale);
        return;
    }

    // Use underscore as a safer separator for customerKey
    const customerKey = `${sanitizedName}_${sanitizedPhone}_${sanitizedAddress}`;
    if (!customers[customerKey]) {
        customers[customerKey] = {
            name: sanitizedName,
            phone: sanitizedPhone,
            address: sanitizedAddress,
            contactMethod: sanitizeString(sale.contact_method) || 'Telegram',
            accountName: sanitizeString(sale.account_name) || '',
            order_date: sale.order_date,
        };
    } else {
        // Update with the latest order date
        if (new Date(sale.order_date) > new Date(customers[customerKey].order_date)) {
            customers[customerKey] = {
                name: sanitizedName,
                phone: sanitizedPhone,
                address: sanitizedAddress,
                contactMethod: sanitizeString(sale.contact_method) || 'Telegram',
                accountName: sanitizeString(sale.account_name) || '',
                order_date: sale.order_date,
            };
        }
    }
});

            // Prepare customer options for Choices.js
            // Show only the customer name in the suggestion box
            const customerChoices = Object.keys(customers).map(key => ({
                value: key,
                label: customers[key].name, // Only show the name in the dropdown
            }));

            // Log to verify customer choices
            console.log('Filtered salesData (last 2 days):', recentSales);
            console.log('Customer choices in setupNewSaleForm:', customerChoices);

            // If no customers are available, show a message in the dropdown
            if (customerChoices.length === 0) {
                customerNameContainer.innerHTML = `
                    <p class="text-gray-400 text-sm">No recent customers found (last 2 days).</p>
                    <select id="customerName" name="customerName" class="choices-select hidden"></select>
                `;
                return;
            }

            // Initialize Choices.js
            try {
                customerInputInstance = new Choices('#customerName', {
                    placeholderValue: 'Select or search for a customer...',
                    searchPlaceholderValue: 'Search customers...',
                    choices: customerChoices,
                    searchEnabled: true,
                    removeItemButton: true,
                    shouldSort: false,
                    searchFields: ['label'],
                    itemSelectText: '',
                    classNames: {
                        containerOuter: 'choices choices-select',
                    },
                    noChoicesText: 'No recent customers available',
                    noResultsText: 'No customers found matching your search',
                });

                // Apply a font that supports Burmese script
                const choicesElement = document.querySelector('.choices');
                if (choicesElement) {
                    choicesElement.style.fontFamily = "'Noto Sans Myanmar', sans-serif";
                }

                // Log Choices.js initialization
                console.log('Choices.js initialized with options:', customerChoices);

                // Add event listener to debug dropdown opening
                customerInputInstance.passedElement.element.addEventListener('showDropdown', () => {
                    console.log('Dropdown opened');
                });

                // Add event listener to debug dropdown closing
                customerInputInstance.passedElement.element.addEventListener('hideDropdown', () => {
                    console.log('Dropdown closed');
                });

                // Auto-fill fields when a customer is selected
                customerInputInstance.passedElement.element.addEventListener('change', () => {
                    const customerKey = customerInputInstance.getValue(true);
                    console.log('Selected customer key:', customerKey);
                    const customer = customers[customerKey];
                    if (customer) {
                        document.getElementById('phoneNo').value = customer.phone !== 'No Phone' ? customer.phone : '';
                        document.getElementById('address').value = customer.address !== 'No Address' ? customer.address : '';
                        document.getElementById('contactMethod').value = customer.contactMethod;
                        document.getElementById('accountName').value = customer.accountName;
                    } else {
                        clearCustomerFields();
                    }
                });

                // Clear fields when the customer name is removed
                customerInputInstance.passedElement.element.addEventListener('removeItem', () => {
                    console.log('Customer name removed');
                    clearCustomerFields();
                });
            } catch (error) {
                console.error('Error initializing Choices.js:', error);
                // Fallback to a plain select element if Choices.js fails
                customerNameContainer.innerHTML = `
                    <select id="customerName" name="customerName" class="bg-gray-800/50 text-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full" style="font-family: 'Noto Sans Myanmar', sans-serif;">
                        <option value="">Select a customer...</option>
                        ${customerChoices.map(choice => `<option value="${choice.value}">${choice.label}</option>`).join('')}
                    </select>
                `;
                // Add event listener to the fallback select
                const fallbackSelect = document.getElementById('customerName');
                fallbackSelect.addEventListener('change', () => {
                    const customerKey = fallbackSelect.value;
                    console.log('Selected customer key (fallback):', customerKey);
                    const customer = customers[customerKey];
                    if (customer) {
                        document.getElementById('phoneNo').value = customer.phone !== 'No Phone' ? customer.phone : '';
                        document.getElementById('address').value = customer.address !== 'No Address' ? customer.address : '';
                        document.getElementById('contactMethod').value = customer.contactMethod;
                        document.getElementById('accountName').value = customer.accountName;
                    } else {
                        clearCustomerFields();
                    }
                });
            }
        }
    }

    // Initialize the customer input in the default mode
    setupCustomerInput();

    // Handle button clicks to switch modes
    newCustomerBtn.addEventListener('click', () => {
        customerMode = 'new';
        newCustomerBtn.classList.add('active');
        newCustomerBtn.classList.remove('bg-gray-700', 'hover:bg-gray-600');
        newCustomerBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
        existingCustomerBtn.classList.remove('active');
        existingCustomerBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
        existingCustomerBtn.classList.add('bg-gray-700', 'hover:bg-gray-600');
        setupCustomerInput();
    });

    existingCustomerBtn.addEventListener('click', () => {
        customerMode = 'existing';
        existingCustomerBtn.classList.add('active');
        existingCustomerBtn.classList.remove('bg-gray-700', 'hover:bg-gray-600');
        existingCustomerBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
        newCustomerBtn.classList.remove('active');
        newCustomerBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
        newCustomerBtn.classList.add('bg-gray-700', 'hover:bg-gray-600');
        setupCustomerInput();
    });

    // Existing functionality for item selection and total calculation
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

    // Initialize Flatpickr for date pickers with default UI
    const datePickers = document.querySelectorAll('.new-sale-date-picker');
    datePickers.forEach(picker => {
        try {
            flatpickr(picker, {
                dateFormat: "d-m-Y",
                maxDate: "today",
                position: "below",
                onOpen: function(selectedDates, dateStr, instance) {
                    instance.calendarContainer.style.zIndex = '3000';
                    // Ensure default Flatpickr styles are not overridden
                    instance.calendarContainer.classList.add('flatpickr-default');
                },
            });
        } catch (error) {
            console.error('Error initializing Flatpickr for:', picker.id, error);
        }
    });

    // Form submission
// Form submission
document.getElementById('newSaleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    let customerName, customerPhone, customerAddress;

    if (customerMode === 'new') {
        customerName = sanitizeString(document.getElementById('customerName').value);
        customerPhone = sanitizeString(document.getElementById('phoneNo').value);
        customerAddress = sanitizeString(document.getElementById('address').value);
    } else {
        const customerKey = customerInputInstance ? customerInputInstance.getValue(true) : document.getElementById('customerName').value;
        if (customerKey) {
            const [name, phone, address] = customerKey.split('_');
            customerName = sanitizeString(name);
            customerPhone = sanitizeString(phone === 'No Phone' ? '' : phone);
            customerAddress = sanitizeString(address === 'No Address' ? '' : address);
        } else {
            customerName = '';
            customerPhone = '';
            customerAddress = '';
        }
    }

    const formData = {
        orderId: document.getElementById('orderId').value,
        orderDate: document.getElementById('orderDate').value,
        customerName: customerName,
        phoneNo: customerPhone || sanitizeString(document.getElementById('phoneNo').value),
        address: customerAddress || sanitizeString(document.getElementById('address').value),
        contactMethod: sanitizeString(document.getElementById('contactMethod').value),
        accountName: sanitizeString(document.getElementById('accountName').value),
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
        discount: parseFloat(document.getElementById('discount').value) || 0,
        remarks: document.getElementById('remarks').value,
    };

    if (!formData.itemPurchased) {
        alert('Please select an item');
        return;
    }
    if (!formData.customerName) {
        alert('Please enter or select a customer name');
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
        console.log('New sale row:', newRow); // Debug: Log the row being sent
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
        await fetchSheetData();
        console.log('salesData after refresh:', salesData); // Debug: Log salesData
        closeFormModal();
    } catch (error) {
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
        <div class="form-group">
            <label for="orderIdInput">Order ID:</label>
            <input type="text" id="orderIdInput" placeholder="e.g., sale_2025_0001">
            <div id="orderIdError" class="error"></div>
        </div>
        <div class="btn-container">
            <button type="button" class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg" onclick="closeFormModal()">Cancel</button>
            <button type="button" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg" onclick="searchOrder()">Search</button>
        </div>
        <div id="saleDetails" class="hidden">
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
                <button type="button" class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg" onclick="goBack()">Back</button>
                <button type="button" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg" id="processButton" onclick="processCancelReturn()">Process</button>
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
            document.getElementById('saleDetails').classList.remove('hidden');
            document.getElementById('orderIdInput').disabled = true;
            document.getElementById('processButton').disabled = false;
        } else {
            orderFound = false;
            orderIdError.textContent = 'Order ID not found.';
            document.getElementById('saleDetails').classList.add('hidden');
            document.getElementById('processButton').disabled = true;
        }
    };

    window.goBack = function() {
        orderFound = false;
        document.getElementById('saleDetails').classList.add('hidden');
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
            alert('Failed to process cancel/return: ' + error.message);
        }
    };
}

// Receipt Functions
function showReceiptForm() {
    if (!isDataLoaded) {
        alert('Data is still loading. Please wait.');
        return;
    }
    DOM.receiptModal.classList.remove('hidden');

    // Group sales by customer (name, phone number, address)
    const customers = {};
    // First sort salesData by date in descending order (newest first)
    const sortedSales = [...salesData].sort((a, b) => {
        const dateA = new Date(a.order_date);
        const dateB = new Date(b.order_date);
        return dateB - dateA; // Descending order
    });
    
    sortedSales.forEach(sale => {
        const remarks = (sale.remarks || '').toLowerCase();
        if (remarks.includes('cancel') || remarks.includes('return')) return; // Skip canceled/returned orders

        const customerKey = `${sale.customer_name || 'Unknown'}-${sale.phone_no || 'No Phone'}-${sale.address || 'No Address'}`;
        if (!customers[customerKey]) {
            customers[customerKey] = {
                name: sale.customer_name || 'Unknown',
                phone: sale.phone_no || 'No Phone',
                address: sale.address || 'No Address',
                orders: [],
                latestOrderDate: new Date(sale.order_date) // Track the latest order date
            };
        }
        customers[customerKey].orders.push(sale);
        // Update the latest order date if this sale is newer
        const currentDate = new Date(sale.order_date);
        if (currentDate > customers[customerKey].latestOrderDate) {
            customers[customerKey].latestOrderDate = currentDate;
        }
    });

    // Convert customers object to array and sort by latestOrderDate in descending order
    const sortedCustomers = Object.values(customers).sort((a, b) => {
        return b.latestOrderDate - a.latestOrderDate;
    });

    // Prepare customer options for Choices.js
    const customerChoices = sortedCustomers.map(customer => ({
        value: `${customer.name}-${customer.phone}-${customer.address}`,
        label: `${customer.name} (${customer.phone}) - ${customer.address}`
    }));

    // Rest of the function remains the same...
    DOM.receiptContent.innerHTML = `
        <div class="form-group">
            <label for="receiptCustomer">Search Customer:</label>
            <select id="receiptCustomer" class="choices-select"></select>
            <div id="receiptCustomerError" class="error"></div>
        </div>
        <div class="form-group hidden" id="receiptOrdersDiv">
            <label for="receiptOrders">Select Orders:</label>
            <select id="receiptOrders" multiple size="5">
            </select>
            <p class="text-gray-400 text-sm mt-2">Hold Ctrl (or Cmd on Mac) to select multiple orders. Leave blank to include all orders for this customer.</p>
        </div>
        <div class="btn-container">
            <button type="button" class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg" onclick="closeReceiptModal()">Cancel</button>
            <button type="button" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg" onclick="generateReceipt()">Generate Receipt</button>
        </div>
    `;

    // Initialize Choices.js for the customer select
    const customerSelect = new Choices('#receiptCustomer', {
        placeholderValue: 'Type to search customers...',
        searchPlaceholderValue: 'Type to search customers...',
        choices: customerChoices,
        searchEnabled: true,
        removeItemButton: true,
        shouldSort: false,
        searchFields: ['label'],
        itemSelectText: '',
    });

    // Add change event listener to update orders
    customerSelect.passedElement.element.addEventListener('change', () => {
        const customerKey = customerSelect.getValue(true);
        updateReceiptOrders(customerKey);
    });
}

function closeReceiptModal() {
    DOM.receiptModal.classList.add('hidden');
    DOM.receiptContent.innerHTML = '';
}

function updateReceiptOrders(customerKey) {
    const ordersSelect = document.getElementById('receiptOrders');
    const ordersDiv = document.getElementById('receiptOrdersDiv');

    if (!customerKey) {
        ordersDiv.classList.add('hidden');
        ordersSelect.innerHTML = '';
        return;
    }

    // Group sales by customer to fetch orders
    const customers = {};
    salesData.forEach(sale => {
        const remarks = (sale.remarks || '').toLowerCase();
        if (remarks.includes('cancel') || remarks.includes('return')) return;

        const key = `${sale.customer_name || 'Unknown'}-${sale.phone_no || 'No Phone'}-${sale.address || 'No Address'}`;
        if (!customers[key]) {
            customers[key] = {
                name: sale.customer_name || 'Unknown',
                phone: sale.phone_no || 'No Phone',
                address: sale.address || 'No Address',
                orders: [],
            };
        }
        customers[key].orders.push(sale);
    });

    const customer = customers[customerKey];
    if (!customer) {
        ordersDiv.classList.add('hidden');
        ordersSelect.innerHTML = '';
        return;
    }

    ordersDiv.classList.remove('hidden');
    ordersSelect.innerHTML = customer.orders.map(sale => `
        <option value="${sale.order_id}">${sale.order_id} (${sale.item_purchased} - ${formatDate(sale.order_date)})</option>
    `).join('');
}

//Generate Receipt
function generateReceipt() {
    const customerKey = document.getElementById('receiptCustomer').value;
    const selectedOrders = Array.from(document.getElementById('receiptOrders').selectedOptions).map(option => option.value);
    const errorDiv = document.getElementById('receiptCustomerError');
    errorDiv.textContent = '';

    if (!customerKey) {
        errorDiv.textContent = 'Please select a customer.';
        return;
    }

    // Group sales by customer
    const customers = {};
    salesData.forEach(sale => {
        const remarks = (sale.remarks || '').toLowerCase();
        if (remarks.includes('cancel') || remarks.includes('return')) return;

        const key = `${sale.customer_name || 'Unknown'}-${sale.phone_no || 'No Phone'}-${sale.address || 'No Address'}`;
        if (!customers[key]) {
            customers[key] = {
                name: sale.customer_name || 'Unknown',
                phone: sale.phone_no || 'No Phone',
                address: sale.address || 'No Address',
                orders: [],
            };
        }
        customers[key].orders.push(sale);
    });

    const customer = customers[customerKey];
    if (!customer || !customer.orders.length) {
        errorDiv.textContent = 'No valid orders found for this customer.';
        return;
    }

    // Filter orders based on selection (if any)
    let ordersToInclude = customer.orders;
    if (selectedOrders.length > 0) {
        ordersToInclude = customer.orders.filter(sale => selectedOrders.includes(sale.order_id));
    }

    if (!ordersToInclude.length) {
        errorDiv.textContent = 'No orders selected or available.';
        return;
    }

    // Calculate totals
let subtotal = 0;
let totalDiscount = 0;
const itemsHtml = ordersToInclude.map(sale => {
    const itemTotal = (parseFloat(sale.selling_price) || 0) * (parseInt(sale.quantity_sold) || 0);
    const discount = parseFloat(sale.discount) || 0;
    subtotal += itemTotal;
    totalDiscount += discount;
    return `
        <tr>
            <td class="text-gray-300">${sale.item_purchased || 'N/A'}</td>
            <td class="text-gray-300">${sale.quantity_sold || 0}</td>
            <td class="text-gray-300">${formatNumberWithCommas(sale.selling_price || 0)} MMK</td>
            <td class="text-gray-300">${formatNumberWithCommas(itemTotal)} MMK</td>
        </tr>
        ${discount > 0 ? `
        <tr>
            <td class="text-gray-300" colspan="3">Discount (Order ${sale.order_id})</td>
            <td class="text-gray-300">-${formatNumberWithCommas(discount)} MMK</td>
        </tr>
        ` : ''}
    `;
}).join('');

// Calculate the final total by subtracting the total discount from the subtotal
const total = subtotal - totalDiscount;

// Generate receipt HTML
const receiptHtml = `
    <div class="receipt" id="receiptContent" style="padding: 20px;">
        <div class="receipt-header text-center mb-4">
            <h3 class="text-xl font-bold text-blue-300">Funny Zone</h3>
            <p class="text-gray-300">Yangon, Myanmar</p>
            <p class="text-gray-300">Receipt #${ordersToInclude[0].order_id.split('_')[2]}_${new Date().getTime()}</p>
            <p class="text-gray-300">${new Date().toLocaleString()}</p>
        </div>
        <div class="billing-info">
            <h4 class="text-blue-300 font-semibold">Billing Information</h4>
            <p class="text-gray-300"><strong>Customer:</strong> ${customer.name}</p>
            <p class="text-gray-300"><strong>Phone:</strong> ${customer.phone}</p>
            <p class="text-gray-300"><strong>Address:</strong> ${customer.address}</p>
        </div>
        <table class="receipt-table">
            <thead>
                <tr>
                    <th class="text-gray-300">Item</th>
                    <th class="text-gray-300">Qty</th>
                    <th class="text-gray-300">Price</th>
                    <th class="text-gray-300">Total</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHtml}
            </tbody>
        </table>
        <div class="receipt-totals">
            <p class="text-gray-300"><strong>Subtotal:</strong> ${formatNumberWithCommas(subtotal)} MMK</p>
            <p class="text-gray-300"><strong>Total Discount:</strong> ${formatNumberWithCommas(totalDiscount)} MMK</p>
            <p class="text-gray-300"><strong>Total:</strong> ${formatNumberWithCommas(total)} MMK</p>
        </div>
        <div class="receipt-footer text-center">
            <p class="text-gray-300">Thank you for your purchase!</p>
            <p class="text-gray-300">Contact: 09787647412</p>
            <p class="text-gray-300">TikTok: @funnyzone737</p>
            <p class="text-gray-300">YouTube: @funnyzone-737</p>
            <p class="text-gray-300">Viber/Telegram: 09787647412</p>
        </div>
    </div>
    <div class="btn-container mt-4" id="receiptButtons">
        <button type="button" class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg" onclick="closeReceiptModal()">Close</button>
        <button type="button" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg" onclick="downloadReceipt()">Download as Image</button>
    </div>
`;
DOM.receiptContent.innerHTML = receiptHtml;
}

function generateReceiptFromDetails(orderId) {
    closeOrderDetails();
    showReceiptForm();

    const sale = salesData.find(s => s.order_id === orderId);
    if (!sale) return;

    const customerKey = `${sale.customer_name || 'Unknown'}-${sale.phone_no || 'No Phone'}-${sale.address || 'No Address'}`;
    const customerSelect = Choices.getChoiceByValue('#receiptCustomer', customerKey);
    if (customerSelect) {
        customerSelect.setChoiceByValue(customerKey);
        updateReceiptOrders(customerKey);

        // Pre-select the specific order
        const ordersSelect = document.getElementById('receiptOrders');
        Array.from(ordersSelect.options).forEach(option => {
            if (option.value === orderId) {
                option.selected = true;
            }
        });
    }
}

function downloadReceipt() {
    const receiptElement = document.getElementById('receiptContent');
    const buttons = document.getElementById('receiptButtons');
    buttons.style.display = 'none';

    html2canvas(receiptElement, {
        backgroundColor: '#0a192f',
        scale: 2,
        padding: 20, // Ensure margins are captured
    }).then(canvas => {
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `receipt_${new Date().toISOString().split('T')[0]}.png`;
        link.click();
        buttons.style.display = 'flex';
    }).catch(error => {
        buttons.style.display = 'flex';
        alert('Failed to download receipt: ' + error.message);
    });
}

// Search and Pagination
function setDefaultDateRange() {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(endDate.getMonth() - 1);

    flatpickr('#startDate', {
        dateFormat: 'd-m-Y',
        defaultDate: startDate,
        maxDate: 'today',
        position: 'below',
        onOpen: function(selectedDates, dateStr, instance) {
            instance.calendarContainer.style.zIndex = '3000';
        },
    });

    flatpickr('#endDate', {
        dateFormat: 'd-m-Y',
        defaultDate: endDate,
        maxDate: 'today',
        position: 'below',
        onOpen: function(selectedDates, dateStr, instance) {
            instance.calendarContainer.style.zIndex = '3000';
        },
    });
}

function handleSearch(page = 1) {
    if (!isDataLoaded) return;
    showLoader();
    currentPage = page;

    const orderId = document.getElementById('orderIdSearch').value.trim().toLowerCase();
    const customer = document.getElementById('customerSearch').value.trim().toLowerCase();
    const startDateStr = document.getElementById('startDate').value;
    const endDateStr = document.getElementById('endDate').value;

    const parseDate = (dateStr) => {
        if (!dateStr) return null;
        const [day, month, year] = dateStr.split('-');
        return new Date(`${year}-${month}-${day}`);
    };

    const startDate = parseDate(startDateStr);
    const endDate = parseDate(endDateStr);

    let filteredSales = salesData.filter(sale => {
        const saleDate = new Date(sale.order_date);
        saleDate.setHours(0, 0, 0, 0);
        const remarks = (sale.remarks || '').toLowerCase();
        return (
            (!orderId || sale.order_id.toLowerCase().includes(orderId)) &&
            (!customer || (sale.customer_name || '').toLowerCase().includes(customer)) &&
            (!startDate || saleDate >= startDate) &&
            (!endDate || saleDate <= new Date(endDate.getTime() + 86399999)) &&
            !remarks.includes('cancel') &&
            !remarks.includes('return')
        );
    });

    // Sort by date (newest first)
    filteredSales.sort((a, b) => {
        const dateA = new Date(a.order_date);
        const dateB = new Date(b.order_date);
        return dateB - dateA;
    });

    const totalItems = filteredSales.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    const paginatedSales = filteredSales.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    renderResultsTable(paginatedSales);
    renderPagination(totalItems, totalPages);
    hideLoader();
}

function renderResultsTable(sales) {
    const tbody = DOM.resultsTable.querySelector('tbody');
    tbody.innerHTML = '';
    DOM.noResults.classList.add('hidden');

    if (!sales.length) {
        DOM.noResults.classList.remove('hidden');
        return;
    }

    sales.forEach(sale => {
        const statusClass = sale.payment_status === 'ပြီး' ? 'status-paid' : sale.payment_status === 'မပြီး' ? 'status-pending' : 'status-failed';
        const row = document.createElement('tr');
        row.className = 'table-row border-b border-gray-800/50 hover:bg-gray-800/20 fade-in';
        row.innerHTML = `
            <td class="py-4 text-blue-400 font-medium">${sale.order_id || 'N/A'}</td>
            <td class="py-4">${formatDate(sale.order_date) || 'N/A'}</td>
            <td class="py-4">${sale.customer_name || 'N/A'}</td>
            <td class="py-4">${sale.quantity_sold || 0}</td>
            <td class="py-4">${formatNumberWithCommas(sale.total_value || 0)} MMK</td>
            <td class="py-4">
                <span class="${statusClass} px-3 py-1 rounded-full text-xs">${sale.payment_status || 'N/A'}</span>
            </td>
            <td class="py-4">
                <button class="text-blue-400 hover:text-blue-300" onclick="showOrderDetails('${sale.order_id}')">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function searchOrders() {
    const orderId = document.getElementById('searchOrderId').value.toLowerCase();
    const customer = document.getElementById('searchCustomer').value.toLowerCase();
    const startDate = document.getElementById('searchStartDate').value;
    const endDate = document.getElementById('searchEndDate').value;

    // Parse dates in d-m-Y format
    const parseDate = (dateStr) => {
        if (!dateStr) return null;
        const [day, month, year] = dateStr.split('-');
        return new Date(`${year}-${month}-${day}`);
    };

    const startDateParsed = parseDate(startDate);
    const endDateParsed = parseDate(endDate);

    // Filter sales data
    let filteredSales = salesData.filter(sale => {
        const saleDate = new Date(sale.order_date);
        saleDate.setHours(0, 0, 0, 0); // Normalize time to avoid time-based mismatches
        const remarks = (sale.remarks || '').toLowerCase();

        return (
            (!orderId || (sale.order_id || '').toLowerCase().includes(orderId)) &&
            (!customer || (sale.customer_name || '').toLowerCase().includes(customer)) &&
            (!startDateParsed || saleDate >= startDateParsed) &&
            (!endDateParsed || saleDate <= new Date(endDateParsed.getTime() + 86399999)) && // Include full end date
            !remarks.includes('cancel') &&
            !remarks.includes('return')
        );
    });

    // Sort by date (newest first)
    filteredSales.sort((a, b) => {
        const dateA = new Date(a.order_date);
        const dateB = new Date(b.order_date);
        return dateB - dateA;
    });

    // Update the current page to 1 after a new search
    currentPage = 1;
    const totalItems = filteredSales.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    const paginatedSales = filteredSales.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    // Render the results and pagination
    renderResultsTable(paginatedSales);
    renderPagination(totalItems, totalPages);
}

function renderPagination(totalItems, totalPages) {
    DOM.pagination.innerHTML = '';
    if (totalPages <= 1) return;

    const createButton = (text, page, disabled = false) => {
        const button = document.createElement('button');
        button.className = `px-3 py-1 rounded-lg ${disabled ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`;
        button.textContent = text;
        if (!disabled) {
            button.onclick = () => handleSearch(page);
        }
        DOM.pagination.appendChild(button);
    };

    // Previous button
    createButton('Previous', currentPage - 1, currentPage === 1);

    // Page numbers
    const maxButtons = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    startPage = Math.max(1, endPage - maxButtons + 1);

    for (let i = startPage; i <= endPage; i++) {
        const button = document.createElement('button');
        button.className = `px-3 py-1 rounded-lg ${i === currentPage ? 'bg-blue-400 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`;
        button.textContent = i;
        button.onclick = () => handleSearch(i);
        DOM.pagination.appendChild(button);
    }

    // Next button
    createButton('Next', currentPage + 1, currentPage === totalPages);
}

// Order Details
function showOrderDetails(orderId) {
    const sale = salesData.find(s => s.order_id === orderId);
    if (!sale) {
        alert('Order not found.');
        return;
    }

    const inventoryItem = inventoryData.find(item => item.item_name === sale.item_purchased);
    const profit = ((parseFloat(sale.selling_price) || 0) - (inventoryItem ? (parseFloat(inventoryItem.purchased_price) || 0) : 0)) * (parseInt(sale.quantity_sold) || 0);

    DOM.modal.classList.remove('hidden');
    document.getElementById('orderDetails').innerHTML = `
        <div class="order-info grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="order-info-group bg-gray-800/30 backdrop-blur-md p-4 rounded-lg">
                <h4 class="text-blue-300 font-semibold mb-2">Order Information</h4>
                <p class="text-gray-300"><strong>Order ID:</strong> ${sale.order_id || 'N/A'}</p>
                <p class="text-gray-300"><strong>Date:</strong> ${formatDate(sale.order_date) || 'N/A'}</p>
                <p class="text-gray-300"><strong>Payment Status:</strong> ${sale.payment_status || 'N/A'}</p>
                <p class="text-gray-300"><strong>Payment Method:</strong> ${sale.payment_method || 'N/A'}</p>
                <p class="text-gray-300"><strong>Payment Date:</strong> ${formatDate(sale.payment_date) || 'N/A'}</p>
            </div>
            <div class="order-info-group bg-gray-800/30 backdrop-blur-md p-4 rounded-lg">
                <h4 class="text-blue-300 font-semibold mb-2">Customer Information</h4>
                <p class="text-gray-300"><strong>Name:</strong> ${sale.customer_name || 'N/A'}</p>
                <p class="text-gray-300"><strong>Phone:</strong> ${sale.phone_no || 'N/A'}</p>
                <p class="text-gray-300"><strong>Address:</strong> ${sale.address || 'N/A'}</p>
                <p class="text-gray-300"><strong>Contact Method:</strong> ${sale.contact_method || 'N/A'}</p>
                <p class="text-gray-300"><strong>Account Name:</strong> ${sale.account_name || 'N/A'}</p>
            </div>
            <div class="order-info-group bg-gray-800/30 backdrop-blur-md p-4 rounded-lg md:col-span-2">
                <h4 class="text-blue-300 font-semibold mb-2">Order Items</h4>
                <div class="flex justify-between text-gray-300">
                    <span>${sale.item_purchased || 'N/A'}</span>
                    <span>${sale.quantity_sold || 0} x ${formatNumberWithCommas(sale.selling_price || 0)} MMK</span>
                </div>
                <div class="flex justify-between text-gray-300 mt-2">
                    <span>Discount</span>
                    <span>-${formatNumberWithCommas(sale.discount || 0)} MMK</span>
                </div>
            </div>
            <div class="order-info-group bg-gray-800/30 backdrop-blur-md p-4 rounded-lg md:col-span-2">
                <h4 class="text-blue-300 font-semibold mb-2">Order Total</h4>
                <div class="flex justify-between text-gray-300">
                    <span>Total</span>
                    <span>${formatNumberWithCommas(sale.total_value || 0)} MMK</span>
                </div>
            </div>
            <div class="order-info-group bg-gray-800/30 backdrop-blur-md p-4 rounded-lg">
                <h4 class="text-blue-300 font-semibold mb-2">Delivery Information</h4>
                <p class="text-gray-300"><strong>Service:</strong> ${sale.delivery_service || 'N/A'}</p>
                <p class="text-gray-300"><strong>Date:</strong> ${formatDate(sale.delivery_date) || 'N/A'}</p>
                <p class="text-gray-300"><strong>Tracking No.:</strong> ${sale.tracking_no || 'N/A'}</p>
            </div>
            <div class="order-info-group bg-gray-800/30 backdrop-blur-md p-4 rounded-lg">
                <h4 class="text-blue-300 font-semibold mb-2">Additional Information</h4>
                <p class="text-gray-300"><strong>Remarks:</strong> ${sale.remarks || 'N/A'}</p>
                <p class="text-gray-300"><strong>Profit:</strong> ${formatNumberWithCommas(profit)} MMK</p>
            </div>
        </div>
    `;
}

function closeOrderDetails() {
    DOM.modal.classList.add('hidden');
}

// Event Listeners
function setupEventListeners() {
    DOM.searchBtn.addEventListener('click', () => handleSearch(1));
    DOM.resetBtn.addEventListener('click', () => {
        document.getElementById('orderIdSearch').value = '';
        document.getElementById('customerSearch').value = '';
        setDefaultDateRange();
        handleSearch(1);
    });
    DOM.closeModal.addEventListener('click', closeOrderDetails);
    document.querySelectorAll('.category-toggle').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.category-toggle').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            updateInventoryChart(button.dataset.type);
        });
    });

    // Setup search inputs for immediate filtering
    document.getElementById('orderIdSearch').addEventListener('input', () => handleSearch(1));
    document.getElementById('customerSearch').addEventListener('input', () => handleSearch(1));
    document.getElementById('startDate').addEventListener('change', () => handleSearch(1));
    document.getElementById('endDate').addEventListener('change', () => handleSearch(1));
}

// Logout
function logout() {
    gapi.client.setToken(null);
    document.getElementById('logoutButton').classList.add('hidden');
    document.getElementById('loginButton').classList.remove('hidden');
    inventoryData = [];
    salesData = [];
    isDataLoaded = false;
    resetDashboard();
    DOM.resultsTable.querySelector('tbody').innerHTML = '';
    DOM.noResults.classList.remove('hidden');
    DOM.pagination.innerHTML = '';
}

// End of script
