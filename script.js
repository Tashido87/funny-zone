// Google Sheets API Configuration
const API_KEY = 'AIzaSyAztNSJf-fBpvsCfrv8x7oR2ViLKRLQErc';
const SPREADSHEET_ID = '1GzdaBH2Hq7LVx9svDkdlMHr01eODjy9haFMTJFIqgI4';
const INVENTORY_SHEET = 'Inventory';
const SALES_SHEET = 'Sale_Log';

// Global data storage
let inventoryData = [];
let salesData = [];
let isDataLoaded = false;

// DOM elements
const DOM = {
    loader: document.getElementById('loader'),
    noResults: document.getElementById('noResults'),
    resultsTable: document.getElementById('resultsTable'),
    searchBtn: document.getElementById('searchBtn'),
    resetBtn: document.getElementById('resetBtn'),
    modal: document.getElementById('orderDetailsModal'),
    closeModal: document.querySelector('.close'),
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
};

// Utility functions
const formatNumberWithCommas = (number) => {
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const showLoader = () => DOM.loader.classList.remove('hidden');
const hideLoader = () => DOM.loader.classList.add('hidden');

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', async () => {
    showLoader();
    try {
        await fetchSheetData();
        setupHistoryControls();
        updateDashboardSummary(); // Show current month by default
        populateInventoryCards();
        setDefaultDateRange();
        setupEventListeners();
        isDataLoaded = true;
    } catch (error) {
        console.error('Initialization failed:', error);
        alert('Failed to load data. Please check your connection and try again.');
    } finally {
        hideLoader();
    }
});

// Fetch data from Google Sheets
async function fetchSheetData() {
    const fetchData = async (sheet) => {
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${sheet}?key=${API_KEY}`
        );
        if (!response.ok) throw new Error(`Failed to fetch ${sheet} data`);
        const result = await response.json();
        if (!result.values || result.values.length <= 1) return [];
        const headers = result.values[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
        console.log(`Headers for ${sheet}:`, headers); // Debug: Log the headers
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
    console.log('Sample sales data:', salesData[0]); // Debug: Log a sample of sales data
    console.log('Sample inventory data:', inventoryData[0]); // Debug: Log a sample of inventory data
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

    // Modified: Only include the year 2025
    const year = 2025;
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    DOM.customYear.appendChild(option);

    // Set default to current month/year
    const today = new Date();
    DOM.customMonth.value = today.getMonth();
    DOM.customYear.value = year; // Set to 2025
}

// Update dashboard summary stats
function updateDashboardSummary() {
    if (!salesData.length || !inventoryData.length) {
        resetDashboardSummary();
        return;
    }

    const selectedMonth = parseInt(DOM.customMonth.value);
    const selectedYear = parseInt(DOM.customYear.value);

    // Filter sales for the selected month/year and exclude canceled/returned orders
    const selectedSales = salesData.filter(sale => {
        const saleDate = new Date(sale.order_date);
        const isMatchingDate = saleDate.getMonth() === selectedMonth && saleDate.getFullYear() === selectedYear;
        const remarks = (sale.remarks || '').toLowerCase();
        const isNotCanceledOrReturned = !remarks.includes('cancel') && !remarks.includes('return');
        return isMatchingDate && isNotCanceledOrReturned;
    });

    // Calculate Total Sales
    const totalSalesValue = selectedSales.reduce((total, sale) => total + (parseFloat(sale.total_value) || 0), 0);

    // Calculate Total Profit as (Selling Price - Purchased Price) × Quantity Sold for each order
    const totalProfit = selectedSales.reduce((total, sale) => {
        const sellingPrice = parseFloat(sale.selling_price) || 0;
        const quantitySold = parseInt(sale.quantity_sold) || 0;
        const itemName = sale.item_purchased || '';
        const inventoryItem = inventoryData.find(item => item.item_name === itemName);
        const purchasedPrice = inventoryItem ? (parseFloat(inventoryItem.purchased_price) || 0) : 0;
        const profitPerOrder = (sellingPrice - purchasedPrice) * quantitySold;
        return total + profitPerOrder;
    }, 0);

    const orderCount = selectedSales.length;
    const itemsSold = selectedSales.reduce((total, sale) => total + (parseInt(sale.quantity_sold) || 0), 0);

    // Calculate previous period sales (for percentage change), also excluding canceled/returned orders
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
    const salesChange = prevPeriodSalesValue === 0 ? 100 : ((totalSalesValue - prevPeriodSalesValue) / prevPeriodSalesValue) * 100;

    DOM.totalSales.textContent = `${formatNumberWithCommas(totalSalesValue)} MMK`;
    DOM.totalProfit.textContent = `${formatNumberWithCommas(totalProfit)} MMK`;
    DOM.orderCount.textContent = orderCount;
    DOM.itemsSold.textContent = itemsSold;

    DOM.salesChange.innerHTML = `<i class="fas fa-arrow-${salesChange >= 0 ? 'up' : 'down'}"></i> ${Math.abs(salesChange).toFixed(1)}%`;
    DOM.salesChange.className = `stat-change ${salesChange >= 0 ? 'positive' : 'negative'}`;
    DOM.profitChange.innerHTML = `<i class="fas fa-arrow-${salesChange >= 0 ? 'up' : 'down'}"></i> ${Math.abs(salesChange).toFixed(1)}%`;
    DOM.profitChange.className = `stat-change ${salesChange >= 0 ? 'positive' : 'negative'}`;
}

function resetDashboardSummary() {
    DOM.totalSales.textContent = '0 MMK';
    DOM.totalProfit.textContent = '0 MMK';
    DOM.orderCount.textContent = '0';
    DOM.itemsSold.textContent = '0';
    DOM.salesChange.innerHTML = `<i class="fas fa-arrow-up"></i> 0%`;
    DOM.salesChange.className = 'stat-change positive';
    DOM.profitChange.innerHTML = `<i class="fas fa-arrow-up"></i> 0%`;
    DOM.profitChange.className = 'stat-change positive';
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

// Set up event listeners
function setupEventListeners() {
    DOM.searchBtn.addEventListener('click', handleSearch);
    DOM.resetBtn.addEventListener('click', resetSearch);
    DOM.viewHistoryBtn.addEventListener('click', updateDashboardSummary);
    DOM.closeModal.addEventListener('click', () => {
        DOM.modal.style.display = 'none';
    });
    window.addEventListener('click', (event) => {
        if (event.target === DOM.modal) {
            DOM.modal.style.display = 'none';
        }
    });

    // Add Enter key listener for customer name search
    document.getElementById('customerSearch').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleSearch();
        }
    });

    // Add Enter key listener for order ID search
    document.getElementById('orderIdSearch').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleSearch();
        }
    });

    // Define today as April 3, 2025, for consistency with the prompt
    const today = new Date(2025, 3, 3); // April 3, 2025 (month is 0-based in JS, so 3 = April)

    // Initialize Flatpickr for startDate
    const startDatePicker = flatpickr("#startDate", {
        dateFormat: "d-m-Y", // Matches DD-MM-YYYY format
        maxDate: today,      // Explicitly set max date to April 3, 2025
        defaultDate: document.getElementById('startDate').value || null, // Use existing default
        disable: [
            function(date) {
                // Disable dates after today (April 3, 2025)
                return date > today;
            }
        ],
        onChange: function(selectedDates, dateStr, instance) {
            // Set minDate for endDate when startDate changes
            endDatePicker.set('minDate', selectedDates[0]);
        }
    });

    // Initialize Flatpickr for endDate
    const endDatePicker = flatpickr("#endDate", {
        dateFormat: "d-m-Y", // Matches DD-MM-YYYY format
        maxDate: today,      // Explicitly set max date to April 3, 2025
        defaultDate: document.getElementById('endDate').value || null, // Use existing default
        disable: [
            function(date) {
                // Disable dates after today (April 3, 2025)
                return date > today;
            }
        ],
        onChange: function(selectedDates, dateStr, instance) {
            // Set maxDate for startDate when endDate changes
            startDatePicker.set('maxDate', selectedDates[0]);
        }
    });
}

// Handle search functionality
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

    // Parse DD-MM-YYYY to Date objects
    const parseDate = (dateStr) => {
        if (!dateStr) return null;
        const [day, month, year] = dateStr.split('-');
        if (!day || !month || !year) return null; // Basic validation
        return new Date(year, month - 1, day); // month - 1 because JS months are 0-based
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
            end.setHours(23, 59, 59); // Include full end day
            filteredResults = filteredResults.filter(sale => {
                if (!sale.order_date) return false;
                return new Date(sale.order_date) <= end;
            });
        }
    }

    displaySearchResults(filteredResults);
}

// Display search results with pagination
function displaySearchResults(results) {
    const tableBody = DOM.resultsTable.querySelector('tbody');
    const paginationContainer = document.getElementById('pagination');
    tableBody.innerHTML = ''; // Clear only the tbody
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

    // Sort results by date (newest first)
    results.sort((a, b) => {
        if (!a.order_date) return 1;
        if (!b.order_date) return -1;
        return new Date(b.order_date) - new Date(a.order_date);
    });

    // Pagination variables
    const rowsPerPage = 10;
    const totalRows = results.length;
    const totalPages = Math.ceil(totalRows / rowsPerPage);
    let currentPage = 1;

    // Function to render rows for the current page
    function renderPage(page) {
        tableBody.innerHTML = ''; // Clear only the tbody content
        const startIndex = (page - 1) * rowsPerPage;
        const endIndex = Math.min(startIndex + rowsPerPage, totalRows);

        for (let i = startIndex; i < endIndex; i++) {
            const sale = results[i];
            const tr = document.createElement('tr');
            const formattedDate = sale.order_date
                ? new Date(sale.order_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                : 'N/A';

            // Check if Remarks contains "Cancel" or "Return"
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

        // Add event listeners to "View" buttons
        document.querySelectorAll('.view-details').forEach(button => {
            button.addEventListener('click', () => {
                const orderId = button.getAttribute('data-id');
                showOrderDetails(orderId);
            });
        });
    }

    // Function to render pagination controls
    function renderPagination() {
        paginationContainer.innerHTML = '';

        // Previous arrow
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

        // Page numbers
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

        // Next arrow
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

    // Initial render
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

// Reset search form
function resetSearch() {
    // Clear input fields
    document.getElementById('orderIdSearch').value = '';
    document.getElementById('customerSearch').value = '';
    setDefaultDateRange();

    // Completely reset and hide search results UI
    const tableBody = DOM.resultsTable.querySelector('tbody');
    const paginationContainer = document.getElementById('pagination');
    tableBody.innerHTML = ''; // Clear table content
    DOM.resultsTable.classList.add('hidden'); // Hide table
    DOM.noResults.classList.add('hidden'); // Hide "No results" message
    paginationContainer.innerHTML = ''; // Clear pagination content
    paginationContainer.classList.add('hidden'); // Hide pagination
}

// Set default date range (current month) in DD-MM-YYYY format
function setDefaultDateRange() {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const formatDate = (date) => {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0'); // +1 because JS months are 0-based
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    };

    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    startDateInput.value = formatDate(firstDayOfMonth);
    endDateInput.value = formatDate(today);

    // Update Flatpickr instances with default values
    if (startDateInput._flatpickr) startDateInput._flatpickr.setDate(startDateInput.value);
    if (endDateInput._flatpickr) endDateInput._flatpickr.setDate(endDateInput.value);

    hideLoader();
}
