var Express = require("express");
const moment = require('moment');
const credentials = require('../credentials');
const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');
const payPalClient = require('./paypal_client_setup');

var app = Express();

// modules to generate APIs documentation
const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const swaggerOptions = {
    swaggerDefinition: {
        openapi: '3.0.0',
        info: {
            title: 'EZ-BUS',
            version: '1.0.0',
            description:
                'Queste sono API per la gestione dei biglietti.',
            license: {
                name: 'Licensed Under MIT',
                url: 'https://spdx.org/licenses/MIT.html',
            },
            contact: {
                name: 'Group28',
                url: 'http://localhost:8081',
            },
        },
        servers: [
            {
                url: 'http://localhost:8081/',
                description: 'Development server',
            },
        ],
    },
    apis: ["ez-bus-demog28-server/index.js"]
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

app.use(Express.json());
app.use(Express.urlencoded({ extended: true }));

var cors = require('cors')
app.use(cors())

var MongoClient = require("mongodb").MongoClient;
const { urlencoded } = require('express');
const { ObjectId } = require('mongodb');
const res = require("express/lib/response");
var CONNECTION_STRING = "mongodb+srv://" + credentials.db_username + ":" + credentials.db_password + "@cluster0.rrla8.mongodb.net/ezbusdev?retryWrites=true&w=majority"


var DATABASE = "ezbusdev";
var database;

async function connettiDatabaseEPrendiApp(){
    console.log("Connessione al database in corso...");
    let client = await MongoClient.connect(CONNECTION_STRING)
    database = client.db(DATABASE)
    console.log("Connesso al database")
    return app;
}

//per il testing
var port = process.env.PORT || 8081;

//questa api non è stata commentata poiché non svolge niente
app.get('/', (request, response)=>{
    response.send(`
    <div style="display: flex;position: absolute;top: 0;bottom: 0;left: 0;right: 0;justify-content: center;align-items: center;padding:6pt">
        <div style="text-align:center;font-family: monospace;font-size: x-large;">
            Questo è il server delle api 🐝. <br>
            Puoi vedere le api <a href="./api-docs/">qui</a>.
        <div>
    </div>`);
})

/**
 * @swagger
 * /stazioni:
 *  get:
 *   summary: Lista delle stazioni
 *   description: vengono mostrate tutte le stazioni all'interno del database
 *   responses:
 *    200:
 *     description: Una lista di stazioni.
 *     content:
 *      application/json:
 *       schema:
 *        type: array
 *        items:
 *         type: object
 *         properties:
 *          _id:
 *           type: string
 *           description: ID della stazione
 *           example: 61ab9a5fe757bd523db4e9ba 
 *          name: 
 *           type: string
 *           description: Nome della stazione
 *           example: Strigno
 */
app.get('/stazioni', (request, response) => {
    
    database.collection("stazioni").find({}).toArray((error, result) => {
        if (error) {
            console.log(error);
        }

        response.send(result);
    })
})
/**
 * @swagger
 *  /biglietti:
 *   post:
 *    requestBody:
 *     required: true
 *     content:
 *       application/json:
 *        schema:
 *         type: object
 *         properties:
 *          stazione_partenza:
 *           type: string
 *           description: ID della stazione
 *           example: 61ab9eb31e607d0f2cce7c59
 *          stazione_arrivo:
 *           type: string
 *           description: ID della stazione
 *           example: 61ab9fda1e607d0f2cce7c60
 *          viaggio:
 *           type: string
 *           example: 61b3f64ece9723f367f3a840
 *          data_viaggio:
 *           type: string
 *           example: 2021-12-23
 *          nome:
 *           type: string
 *           example: Gino
 *          cognome:
 *           type: string
 *           example: Pastino
 *          pagamento:
 *           type: string
 *           example: 
 *          prezzo: 
 *           type: string
 *           example: 1.70
 *         required:
 *          - stazione_partenza
 *          - stazione_arrivo
 *          - viaggio
 *          - data_viaggio
 *          - nome
 *          - cognome
 *    summary: Aggiunta biglietto richiesto
 *    description: viene inserito il nuovo biglietto scelto nella lista di biglietti acquistati
 *    responses:
 *     200:
 *      description: il biglietto scelto in base al form compilato
 *      content:
 *       text/plain:
 *        example: OK 
 *     400:
 *      description: errore per dati non completi, dati non validi, viaggio non valido
 */
app.post('/biglietti', async (request, response) => {
    if(!request.body.stazione_partenza || !request.body.stazione_arrivo || !request.body.viaggio || !request.body.nome || !request.body.cognome){
        response.status(400)
        response.send("Dati non completi")
        return;
    }

    
    if(!request.body.data_viaggio){
        response.status(400)
        response.send("Data non presente")
        return;
    }

    let data_viaggio = moment(request.body.data_viaggio, moment.ISO_8601)
    if (!data_viaggio.isValid()) {
        response.status(400);
        response.send("Data mal formata")
        return;
    }
    data_viaggio = data_viaggio.startOf('day')

    var viaggio = await database.collection("viaggi").findOne({
        _id : ObjectId(request.body.viaggio)
    })

    if(!viaggio){
        response.status(400)
        response.send("Viaggio non valido")
        return;
    }

    if(data_viaggio.clone().add(moment.duration(trovaFermataInViaggio(viaggio, request.body.stazione_partenza).ora)).isSameOrBefore(moment())){
        response.status(400)
        response.send("Data del viaggio già passata")
        return;
    }

    database.collection("biglietti_acquistati").insertOne({
        viaggio: ObjectId(request.body.viaggio),
        data_viaggio: data_viaggio.format("YYYY-MM-DD"),
        stazione_partenza: ObjectId(request.body.stazione_partenza),
        stazione_arrivo: ObjectId(request.body.stazione_arrivo),
        pagamento: request.body.pagamento??null,
        prezzo: request.body.prezzo??0.0,
        intestatario : {
            nome: request.body.nome,
            cognome: request.body.cognome,
            ...(request.body.telefono && {telefono: request.body.telefono}),
            ...(request.body.data_nascita && {data_nascita: moment(request.body.data_nascita).format("YYYY-MM-DD")})
        }
    });
    response.sendStatus(200);
})
/**
 * @swagger
 *  /biglietti/{id}:
 *   delete:
 *    parameters:
 *     - in: path
 *       name: id
 *       schema:
 *        type: string
 *       example: 61b3f74b98111ddceb4b78a0
 *       required: true
 *    summary: Cancellazione di un biglietto selezionato
 *    description: la cancellazione del biglietto avviene tramite selezione dell'ID del biglietto
 *    responses:
 *     200:
 *      description: cancellazione avvenuta correttamente
 *      content:
 *       text/plain:
 *        example: OK
 *     400:
 *      description: biglietto non trovato
 *      content:
 *       text/plain:
 *        example: Bad Request
 */
app.delete('/biglietti/:id', async (request, response) => {

    var biglietto = await database.collection("biglietti_acquistati").findOne({
        _id: ObjectId(request.params.id)
    })

    if(biglietto)
    {
        if(!biglietto.pagamento){
            database.collection("biglietti_acquistati").deleteOne({
                _id: ObjectId(request.params.id)
            })

            response.status(200);
            response.send("Biglietto eliminato, informazioni per il rimborso non trovate")
            return
        }


        const pprequest = new checkoutNodeJssdk.payments.CapturesRefundRequest(biglietto.pagamento);
        pprequest.requestBody({
            amount: {
                currency_code: 'EUR',
                value: parseFloat((biglietto.prezzo??0/ 2.0)).toFixed(2)
            }
        });
        var refund;
        try {
            refund = await payPalClient.client().execute(pprequest);

            database.collection("biglietti_acquistati").deleteOne({
                _id: ObjectId(request.params.id)
            })
        } catch (err) {
            response.status(500)
            console.error(err)
            response.send(err)
            return;
        }

        response.status(200);
        response.send("Biglietto rimborsato e eliminato")
    }
    else{
        response.status(400)
        response.send("Biglietto non trovato")
    }

})

function trovaFermataInViaggio(viaggio, stazione) {
    return viaggio.fermate.find(fermata => {
        return fermata.stazione.toString() == stazione.toString()
    })
}

function trovaIndiceFermataInViaggio(viaggio, stazione) {
    return viaggio.fermate.findIndex(fermata => {
        return fermata.stazione.toString() == stazione.toString()
    })
}
/**
 * @swagger
 * /biglietti:
 *  get:
 *   summary: Lista di biglietti
 *   description: viene mostrata la lista di tutti i biglietti acquistati precendetemente
 *   responses:
 *    200:
 *     description: lista di biglietti acquistati precedentemente
 *     content:
 *      application/json:
 *       schema:
 *           type: array
 *           items:
 *            type: object
 *            properties:
 *             _id:
 *              type: string
 *              description: ID del biglietto
 *              example: 61b3f74b98111ddceb4b78a0
 *             viaggio:
 *              type: string
 *              description: ID del viaggio
 *              example: 61b3f64ece9723f367f3a842
 *             data_viaggio:
 *              type: string
 *              description: data del viaggio
 *              example: 2001-03-23
 *             stazione_partenza:
 *              type: string
 *              description: ID della stazione
 *              example: 61ab9eb31e607d0f2cce7c58
 *             stazione_arrivo:
 *              type: string
 *              description: ID della stazione
 *              example: 61aba0b31e607d0f2cce7c68
 *             intestatario:
 *              properties:
 *               name:
 *                type: string
 *                description: nome intestatario del biglietto
 *                example: Gino
 *               cognome:
 *                type: string
 *                description: cognome intestatario del biglietto
 *                example: Pastino 
 *             
 */ 
app.get('/biglietti', (request, response) => {
    database.collection("biglietti_acquistati").aggregate(
        [
            {
                $lookup: {
                    from: 'viaggi',
                    localField: 'viaggio',
                    foreignField: '_id',
                    as: 'info_viaggio'

                }
            },
            {
                $lookup: {
                    from: 'stazioni',
                    localField: 'stazione_partenza',
                    foreignField: '_id',
                    as: 'info_stazione_partenza'

                }
            },
            {
                $lookup: {
                    from: 'stazioni',
                    localField: 'stazione_arrivo',
                    foreignField: '_id',
                    as: 'info_stazione_arrivo'

                }
            },
            {
                $unwind: "$info_viaggio",
            },
            {
                $unwind: "$info_stazione_partenza",
            },
            {
                $unwind: "$info_stazione_arrivo",
            }

        ]).toArray((error, result) => {
            if (error) {
                console.log(error);
            }

            let info_espanse = result.map((biglietto) => {
                let fermata_partenza = trovaFermataInViaggio(biglietto.info_viaggio, biglietto.stazione_partenza)
                let fermata_arrivo = trovaFermataInViaggio(biglietto.info_viaggio, biglietto.stazione_arrivo)
                return {
                    ...biglietto,
                    data_partenza: moment(biglietto.data_viaggio).add(moment.duration(fermata_partenza.ora)),
                    data_arrivo: moment(biglietto.data_viaggio).add(moment.duration(fermata_arrivo.ora))
                }
            })


            response.send(info_espanse);
        })
})

/** 
 * @swagger
 * /viaggi-tra-stazioni:
 *  get:
 *   parameters:
 *    - in: query
 *      name: stazione_partenza
 *      schema:
 *       type: string
 *      example: 61ab9eb31e607d0f2cce7c5a
 *      required: true
 *    - in: query
 *      name: stazione_arrivo
 *      schema:
 *       type: string
 *      example: 61aba0761e607d0f2cce7c65
 *      required: true
 *    - in: query
 *      name: data_viaggio
 *      schema:
 *       type: string
 *      example: 2021-12-23
 *      required: true
 *   summary: Scelta del viaggio
 *   description: fornisce il viaggio corretto da percorrere dopo aver scelto una stazione di partenza, una di arrivo e la data di partenza
 *   responses:
 *    200:
 *     description: ritorna i viaggi possibili tra le due stazioni nel giorno scelto
 *     content:
 *       application/json:
 *        schema:
 *           type: array
 *           items:
 *            type: object
 *            properties:
 *             _id:
 *              type: string
 *              description: Id del viaggio
 *              example: 61b3f64ece9723f367f3a845 
 *             nome_linea:
 *              type: string
 *              description: nome della linea
 *              example: Trento – Primolano
 *             giorni:
 *               properties:
 *                Monday:
 *                 type: boolean
 *                 example: true
 *                Tuesday:
 *                 type: boolean
 *                 example: true
 *                Wednesday:
 *                 type: boolean
 *                 example: true
 *                Thursday:
 *                 type: boolean
 *                 example: true
 *                Friday:
 *                 type: boolean
 *                 example: true
 *                Saturday:
 *                 type: boolean
 *                 example: false
 *                Sunday:
 *                 type: boolean
 *                 example: true
 *             posti:
 *              type: Int32
 *              description: numero di posti disponibili per viaggio
 *              example: 5
 *             fermate: 
 *               type: array
 *               items:
 *                  type: object
 *                  properties:
 *                   stazione:
 *                    type: string
 *                    description: Id della stazione passata
 *                    example: 61ab9eb31e607d0f2cce7c58   
 *                   ora:
 *                    type: string
 *                    description: orario di partenza
 *                    example: PT5H
 *                   distanza:
 *                    type: Int32
 *                    description: distanza tra stazioni
 *                    example: 0
 *    400:
 *     description: problema generato dalla non presenza dei dati richiesti, oppure data non valida
 *    500:
 *     description: problema generato dall'errore nel reperire i viaggi possibili dalla stazione di partenza
 */
app.get('/viaggi-tra-stazioni', (request, response) => {
    if (!('stazione_partenza' in request.query) || !('stazione_arrivo' in request.query) ||  !('data_viaggio' in request.query)) {
        response.status(400);
        response.send("Dati non completi")
        return;
    }
    
    let data_viaggio = moment(request.query.data_viaggio, moment.ISO_8601)
    if (!data_viaggio.isValid()) {
        response.status(400);
        response.send("Data mal formata")
        return;
    }

    data_viaggio = data_viaggio.startOf('day');

    if(data_viaggio.isBefore(moment().startOf('day'))){
        response.status(400)
        response.send("La data è già passata")
        return;
    }
    
    database.collection("viaggi").find({
        ["giorni." + data_viaggio.format("dddd")] : true,
        fermate : { $elemMatch: {stazione : ObjectId(request.query.stazione_partenza)}}
    }).toArray(async (error, tuttiViaggi) => {
        if (error) {
            console.log(error);
            response.sendStatus(500);
        }


        let potenzialiViaggi = tuttiViaggi.filter(viaggio => trovaIndiceFermataInViaggio(viaggio, request.query.stazione_partenza) < trovaIndiceFermataInViaggio(viaggio, request.query.stazione_arrivo))
        let viaggiConPosti = await Promise.all(potenzialiViaggi.map(async viaggio => {
            let indexPartenza = trovaIndiceFermataInViaggio(viaggio, request.query.stazione_partenza)
            let indexArrivo = trovaIndiceFermataInViaggio(viaggio, request.query.stazione_arrivo)
            let bigliettiChePotrebberoCollidere = await database.collection("biglietti_acquistati").find(
                {
                    data_viaggio: data_viaggio.format("YYYY-MM-DD"),
                    viaggio: viaggio._id
                }
            ).toArray()


            let postiDisponibili = viaggio.posti

            bigliettiChePotrebberoCollidere.forEach(biglietto => {
                let indexPartenzaBiglietto = trovaIndiceFermataInViaggio(viaggio, biglietto.stazione_partenza)
                let indexArrivoBiglietto = trovaIndiceFermataInViaggio(viaggio, biglietto.stazione_arrivo)
                if ((indexPartenzaBiglietto <= indexPartenza && indexPartenza < indexArrivoBiglietto)
                    ||
                    (indexPartenzaBiglietto < indexArrivo && indexArrivo <= indexArrivoBiglietto)
                ) {
                    postiDisponibili--
                }
            })

            if(data_viaggio.clone().add(moment.duration(viaggio.fermate[indexPartenza].ora)).subtract(5, 'minutes').isSameOrBefore(moment())){ //sottraggo 5 minuti per evitare che l'utente acquisti un biglietto che poi non potrà essere salvato perché passata l'ora di partenza
                return []
            }

            return [{
                ...viaggio,
                posti_disponibili: postiDisponibili,
                index_partenza: indexPartenza,
                index_arrivo: indexArrivo,
                prezzo: Math.round(((viaggio.fermate[indexArrivo].distanza - viaggio.fermate[indexPartenza].distanza)/50.0 + 1)*100)/100
            }]
        }))

        viaggiConPosti = viaggiConPosti.flat(1)
        //console.log(viaggiConPosti)

        viaggiConPosti = viaggiConPosti.sort((a, b) => {
            return moment.duration(a.fermate[a.index_partenza].ora).asMilliseconds() - moment.duration(b.fermate[b.index_partenza].ora).asMilliseconds()
        })

        response.send(viaggiConPosti)
    })
})

module.exports = {app: app, connettiDatabaseEPrendiApp: connettiDatabaseEPrendiApp }