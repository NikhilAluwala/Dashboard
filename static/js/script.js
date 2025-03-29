// Chart.js Global Configuration
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.color = '#64748b';
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(0, 0, 0, 0.8)';
Chart.defaults.plugins.legend.position = 'top';

// Initialize DataTable for summary with enhanced styling
let summaryTable = $('#summaryTable').DataTable({
    pageLength: 10,
    order: [[0, 'asc']],
    responsive: true,
    dom: '<"top"f>rt<"bottom"lip>',
    language: {
        search: "_INPUT_",
        searchPlaceholder: "Search use cases..."
    },
    initComplete: function() {
        $('.dataTables_filter input').addClass('search-input');
    }
});

// Charts instances
let runtimeChart, statusChart, slaChart;

// Show loading spinner
function showLoading() {
    $('.loading-spinner').addClass('active');
}

// Hide loading spinner
function hideLoading() {
    $('.loading-spinner').removeClass('active');
}

// Load initial summary data
$(document).ready(function() {
    loadSummaryData();
});

// Handle cadence filter change with debounce
let filterTimeout;
$('#cadenceFilter').on('change', function() {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => {
        loadSummaryData($(this).val());
    }, 300);
});

// Load summary data with optional cadence filter
function loadSummaryData(cadence = '') {
    showLoading();
    let url = '/api/summary';
    if (cadence) {
        url += `?cadence=${cadence}`;
    }
    
    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            summaryTable.clear();
            data.forEach(row => {
                summaryTable.row.add([
                    `<a href="#" class="use-case-link">${row.Use_Case}</a>`,
                    row.No_of_Models,
                    `<span class="badge badge-${row.Run_Cadence.toLowerCase()}">${row.Run_Cadence}</span>`,
                    row.Number_of_Runs,
                    `<span class="success">${row.SLA_Passed}</span>`,
                    `<span class="error">${row.SLA_Failed}</span>`,
                    row.Comments
                ]);
            });
            summaryTable.draw();
            hideLoading();
        })
        .catch(error => {
            console.error('Error loading summary data:', error);
            hideLoading();
            alert('Error loading data. Please try again.');
        });
}

// Handle use case click with animation
$('#summaryTable').on('click', '.use-case-link', function(e) {
    e.preventDefault();
    const useCase = $(this).text();
    showLoading();
    loadUseCaseDetails(useCase);
});

// Load and display use case details
function loadUseCaseDetails(useCase) {
    fetch(`/api/usecase/${useCase}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            $('#modalTitle').text(useCase + ' Details');
            
            // Initialize detail table with enhanced styling
            if ($.fn.DataTable.isDataTable('#detailTable')) {
                $('#detailTable').DataTable().destroy();
            }
            
            let detailTable = $('#detailTable').DataTable({
                data: data,
                columns: [
                    { data: 'Model_Name' },
                    { 
                        data: 'Date',
                        render: function(data) {
                            return new Date(data).toLocaleDateString();
                        }
                    },
                    { data: 'Start_Time' },
                    { data: 'End_Time' },
                    { 
                        data: 'Runtime',
                        render: function(data) {
                            return data.toFixed(2) + ' hrs';
                        }
                    },
                    { 
                        data: 'Job_Status',
                        render: function(data) {
                            const statusColors = {
                                'Success': 'success',
                                'Failed': 'error',
                                'Running': 'warning'
                            };
                            return `<span class="status-badge ${statusColors[data]}">${data}</span>`;
                        }
                    },
                    { 
                        data: 'SLA_Status',
                        render: function(data) {
                            return `<span class="status-badge ${data === 'Passed' ? 'success' : 'error'}">${data}</span>`;
                        }
                    },
                    { 
                        data: 'SLA_Missed_Time',
                        render: function(data) {
                            return data > 0 ? `<span class="error">${data.toFixed(2)} hrs</span>` : '0';
                        }
                    }
                ],
                pageLength: 5,
                order: [[1, 'desc']],
                responsive: true,
                dom: '<"top"f>rt<"bottom"lip>'
            });
            
            // Update charts with animation
            updateCharts(data);
            
            // Show modal with animation
            $('#detailModal').addClass('active').show();
            setTimeout(() => {
                $('#detailModal .modal-content').addClass('active');
            }, 50);
            
            hideLoading();
        })
        .catch(error => {
            console.error('Error loading use case details:', error);
            hideLoading();
            alert('Error loading details. Please try again.');
        });
}

// Update all charts with new data and animations
function updateCharts(data) {
    // Prepare data for runtime trend chart
    const runtimeData = prepareRuntimeData(data);
    updateRuntimeChart(runtimeData);
    
    // Prepare data for job status pie chart
    const statusData = prepareStatusData(data);
    updateStatusChart(statusData);
    
    // Prepare data for SLA heatmap
    const slaData = prepareSlaData(data);
    updateSlaChart(slaData);
}

// Prepare and update runtime trend chart
function prepareRuntimeData(data) {
    const dates = [...new Set(data.map(item => new Date(item.Date).toLocaleDateString()))].sort();
    const models = [...new Set(data.map(item => item.Model_Name))];
    
    const colorPalette = [
        '#2563eb', '#7c3aed', '#db2777', '#2dd4bf', '#84cc16',
        '#4f46e5', '#9333ea', '#ec4899', '#14b8a6', '#65a30d'
    ];
    
    const datasets = models.map((model, index) => ({
        label: model,
        data: dates.map(date => {
            const entry = data.find(item => 
                new Date(item.Date).toLocaleDateString() === date && 
                item.Model_Name === model
            );
            return entry ? entry.Runtime : null;
        }),
        borderColor: colorPalette[index % colorPalette.length],
        backgroundColor: colorPalette[index % colorPalette.length] + '20',
        tension: 0.4,
        fill: true
    }));
    
    return {
        labels: dates,
        datasets: datasets
    };
}

function updateRuntimeChart(data) {
    if (runtimeChart) runtimeChart.destroy();
    
    runtimeChart = new Chart(document.getElementById('runtimeChart'), {
        type: 'line',
        data: data,
        options: {
            responsive: true,
            animation: {
                duration: 1000,
                easing: 'easeInOutQuart'
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Runtime Trends',
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Runtime (hours)'
                    }
                }
            }
        }
    });
}

// Prepare and update job status pie chart
function prepareStatusData(data) {
    const statusCounts = data.reduce((acc, curr) => {
        acc[curr.Job_Status] = (acc[curr.Job_Status] || 0) + 1;
        return acc;
    }, {});
    
    const colorMap = {
        'Success': '#22c55e',
        'Failed': '#ef4444',
        'Running': '#eab308'
    };
    
    return {
        labels: Object.keys(statusCounts),
        datasets: [{
            data: Object.values(statusCounts),
            backgroundColor: Object.keys(statusCounts).map(status => colorMap[status] || '#64748b'),
            borderWidth: 2,
            borderColor: '#ffffff'
        }]
    };
}

function updateStatusChart(data) {
    if (statusChart) statusChart.destroy();
    
    statusChart = new Chart(document.getElementById('statusChart'), {
        type: 'doughnut',
        data: data,
        options: {
            responsive: true,
            animation: {
                animateRotate: true,
                animateScale: true
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Job Status Distribution',
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                },
                legend: {
                    position: 'bottom'
                }
            },
            cutout: '60%'
        }
    });
}

// Prepare and update SLA heatmap
function prepareSlaData(data) {
    const models = [...new Set(data.map(item => item.Model_Name))];
    const colorPalette = ['#22c55e', '#eab308', '#ef4444'];
    
    const datasets = models.map((model, index) => {
        const modelData = data.filter(item => item.Model_Name === model);
        return {
            label: model,
            data: modelData.map(item => ({
                x: new Date(item.Date).toLocaleDateString(),
                y: item.SLA_Missed_Time
            })),
            backgroundColor: colorPalette[index % colorPalette.length]
        };
    });
    
    return {
        datasets: datasets
    };
}

function updateSlaChart(data) {
    if (slaChart) slaChart.destroy();
    
    slaChart = new Chart(document.getElementById('slaChart'), {
        type: 'bar',
        data: data,
        options: {
            responsive: true,
            animation: {
                duration: 1000,
                easing: 'easeInOutQuart'
            },
            plugins: {
                title: {
                    display: true,
                    text: 'SLA Missed Time by Model',
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Hours Missed'
                    }
                }
            }
        }
    });
}

// Close modal handler with animation
$('.close').on('click', function() {
    $('#detailModal .modal-content').removeClass('active');
    setTimeout(() => {
        $('#detailModal').removeClass('active').hide();
    }, 300);
});

// Close modal when clicking outside with animation
$(window).on('click', function(e) {
    if ($(e.target).is('#detailModal')) {
        $('#detailModal .modal-content').removeClass('active');
        setTimeout(() => {
            $('#detailModal').removeClass('active').hide();
        }, 300);
    }
});

// Handle window resize for responsive charts
let resizeTimeout;
$(window).on('resize', function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (runtimeChart) runtimeChart.resize();
        if (statusChart) statusChart.resize();
        if (slaChart) slaChart.resize();
    }, 250);
});