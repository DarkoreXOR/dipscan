const dns = require('dns');
const net = require('net');
const fs = require('fs/promises');
const util = require('util');

//

const TIMEOUT = 15_000; // 15 seconds (15000 ms)
const PORTS = [8091, 8092, 8093, 8094, 8095, 80, 8080];

// terminal colors

const CFMT = {
    reset: "\x1b[0m",
    red: "\x1b[31m\x1b[1m",
    green: "\x1b[32m\x1b[1m",
    yellow: "\x1b[33m\x1b[1m",
};

// retrieve list of IPs for a domain name

function get_ip_addresses(domain_name) {
    return new Promise((resolve, reject) => {
        const options = {
            family: 4,
            all: true
        };
          
        dns.lookup(domain_name, options, (err, addresses) => {
            if (err) {
                reject(err);
            } else {
                resolve({
                    domain_name: domain_name,
                    addresses: addresses
                });
            }
        });
    });
}

// check if IP:PORT is open/closed

function check_port(domain_name, ip, port, timeout) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();

        client.setTimeout(timeout);
    
        client.on('timeout', () => {
            client.end();
            resolve({
                domain_name: domain_name,
                ip: ip,
                port: port,
                status: false, // port is closed
            });
        });

        client.on('error', err => {
            resolve({
                domain_name: domain_name,
                ip: ip,
                port: port,
                status: false, // port is closed
            });
        });

        client.on('connect', () => {
            client.end();
            resolve({
                domain_name: domain_name,
                ip: ip,
                port: port,
                status: true, // port is open
            });
        });
    
        client.connect(port, ip);
    });
}

async function app() {

    //
    // read a whole file with domains
    //

    const domains = (await fs.readFile('domains.txt', {encoding: 'utf-8'}))
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    //
    // get list of ip addresses for each domain
    //

    const ip_addresses = await Promise.all(
        domains.map(domain => get_ip_addresses(domain))
    );

    //
    // process all IPs of resolved domains
    //

    const port_check_tasks = [];

    for (const ip_address of ip_addresses) {
        const domain_name = ip_address.domain_name;
        const addresses = ip_address.addresses;

        console.log(`domain: ${domain_name}`);

        for (const ip_object of addresses) {
            const ip = ip_object.address;

            console.log(`-> ip: ${ip}`);

            // run check_port tasks for each pair 'ip:port'

            for (const port of PORTS) {
                port_check_tasks.push(check_port(domain_name, ip, port, TIMEOUT));
            }
        }
    }

    //
    // wait all check_port tasks
    //

    console.log(`${CFMT.yellow}checking ports, please, wait...${CFMT.reset}`);

    const check_port_results = await Promise.all(port_check_tasks);

    //
    // prepare CSV data
    //

    const csv = {
        columns: [],
        domain_names: {},
    };

    //
    // prepare CSV columns
    //

    csv.columns.push('DomainName');
    csv.columns.push('IP');

    for (const port of PORTS) {
        csv.columns.push(`:${port}`);
    }

    //
    // prepare CSV data
    //

    for (const check_port_result of check_port_results) {
        const domain_name = check_port_result.domain_name;
        const ip = check_port_result.ip;
        const port = check_port_result.port;
        const status = check_port_result.status;

        if (status) {
            console.log(`[${domain_name}] ${ip}:${port} is ${CFMT.green}open${CFMT.reset}`);
        } else {
            console.log(`[${domain_name}] ${ip}:${port} is ${CFMT.red}closed${CFMT.reset}`);
        }

        csv.domain_names[domain_name] = csv.domain_names[domain_name] || {};
        csv.domain_names[domain_name][ip] = csv.domain_names[domain_name][ip] || {};
        csv.domain_names[domain_name][ip][port] = status;
    }

    //
    // export CSV file
    //

    // Раскоментировать строку ниже для отладки:
    // console.log(util.inspect(csv, {showHidden: false, depth: null, colors: true}));

    let csv_text = '';

    // first row = table headers

    csv_text += csv.columns.map(column => `"${column}"`).join(',') + '\r\n';

    // rest rows = data

    for (const domain_name_key in csv.domain_names) {
        const dn_obj = csv.domain_names[domain_name_key] || {};

        for (const ip_key in dn_obj) {
            const ports_obj = dn_obj[ip_key] || {};

            const csv_data_row = Array(csv.columns.length).fill(null);

            csv_data_row[0] = domain_name_key;
            csv_data_row[1] = ip_key;

            for (const port_key in ports_obj) {
                const port_number = parseInt(port_key);
                const port_status = ports_obj[port_key] || false;
                const port_index = PORTS.indexOf(port_number);

                csv_data_row[2 + port_index] = port_status ? 'OK' : '-';
            }

            csv_text += csv_data_row.map(column => `"${column}"`).join(',') + '\r\n';
        }
    }

    //
    // write CSV file
    //

    await fs.writeFile('net_data.csv', csv_text, {encoding: 'utf-8'});

    console.log('finished');
}

//
// run application
//

app();
