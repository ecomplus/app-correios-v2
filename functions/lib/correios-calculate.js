const logger = require('firebase-functions/logger')
const { newCorreios } = require('./correios-axios')

const calculate = async ({
  correiosParams,
  serviceCodes = ['03220', '03298'],
  correios,
  storeId,
  timeout = 20000
}) => {
  if (!correios) {
    correios = await newCorreios(storeId)
  }
  const { nuContrato, nuDR } = correios.$contract
  if (!(Number(correiosParams.psObjeto) >= 200)) {
    correiosParams.psObjeto = '200'
  }
  if (!(Number(correiosParams.comprimento) >= 15)) {
    correiosParams.comprimento = '15'
  } else if (Number(correiosParams.comprimento) > 100) {
    correiosParams.comprimento = '100'
  }
  if (!(Number(correiosParams.altura) >= 2)) {
    correiosParams.altura = '2'
  } else if (Number(correiosParams.altura) > 100) {
    correiosParams.altura = '100'
  }
  if (!(Number(correiosParams.largura) >= 11)) {
    correiosParams.largura = '11'
  } else if (Number(correiosParams.largura) > 100) {
    correiosParams.largura = '100'
  }
  const { largura, altura, comprimento } = correiosParams
  if (Number(largura) + Number(altura) + Number(comprimento) > 200) {
    correiosParams.comprimento = '100'
    correiosParams.largura = '84'
    correiosParams.altura = '16'
  }
  if (correiosParams.vlDeclarado) {
    const value = Number(correiosParams.vlDeclarado)
    if (value < 25.63) {
      correiosParams.vlDeclarado = '26'
    } else if (value > 10000) {
      correiosParams.vlDeclarado = '10000'
    }
    if (!correiosParams.servicosAdicionais) {
      correiosParams.servicosAdicionais = ['019']
    } else if (!correiosParams.servicosAdicionais.includes('019')) {
      correiosParams.servicosAdicionais.push('019')
    }
  }
  [
    'psObjeto',
    'comprimento',
    'altura',
    'largura',
    'vlDeclarado'
  ].forEach((param) => {
    if (typeof correiosParams[param] === 'number') {
      correiosParams[param] = String(Math.round(correiosParams[param]))
    }
  })
  const debugError = (err) => {
    if (err.response) {
      logger.warn(`[calculate] failed for #${storeId}`, {
        body: err.config.data,
        response: err.response.data,
        status: err.response.status
      })
    } else {
      logger.error(err)
    }
    throw err
  }
  const params = serviceCodes
    .filter((coProduto) => typeof coProduto === 'string' && coProduto)
    .map((coProduto, nuRequisicao) => {
      const _params = {
        ...correiosParams,
        coProduto,
        nuContrato,
        nuDR,
        nuRequisicao,
        tpObjeto: '2'
      }
      const listWithoutAddService = ['03298', '04227', '80659']
      if (listWithoutAddService.includes(coProduto) && _params.vlDeclarado) {
        delete _params.vlDeclarado
        _params.servicosAdicionais = _params.servicosAdicionais.filter((s) => s !== '019')
      }
      return _params
    })
  return Promise.all([
    correios.post('/preco/v1/nacional', {
      idLote: '1',
      parametrosProduto: params
    }, { timeout })
      .catch(debugError),
    correios.post('/prazo/v1/nacional', {
      idLote: '1',
      parametrosPrazo: params
    }, { timeout })
      .catch(debugError)
  ]).then((responses) => {
    responses[1].data.forEach(({ coProduto, ...value }) => {
      const result = responses[0].data.find((result) => result.coProduto === coProduto)
      if (result) {
        Object.assign(result, value)
      }
    })
    return responses[0]
  })
}

module.exports = { calculate }
