import type { Category, Dish, OptionGroup, Restaurant, RestaurantTable } from '@/domain/types'

// Demo tenant: Casa do Mar, a seafood & grill house in Cascais.
// IDs are stable so QR codes printed from the demo keep working after a reset.

export const DEMO_RESTAURANT_ID = '00000000-0000-4000-8000-00000000c0de'
const R = DEMO_RESTAURANT_ID

const model = (file: string, scale = 1) => ({ glbUrl: `/models/${file}.glb`, usdzUrl: `/models/${file}.usdz`, scale })

const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=75`

export const casaDoMar: Restaurant = {
  id: R,
  slug: 'casa-do-mar',
  name: 'Casa do Mar',
  tagline: 'Cozinha de mar e brasa · Cascais',
  description:
    'Peixe da lota de Cascais, marisco vivo e brasa de carvão de azinho. Uma casa de família desde 1987, a dois passos da Praia da Ribeira.',
  cuisine: 'Portuguesa · Peixe e marisco',
  address: 'Rua Frederico Arouca 42, 2750-355 Cascais',
  city: 'Cascais',
  phone: '+351 214 000 000',
  locale: 'pt-PT',
  currency: 'EUR',
  timezone: 'Europe/Lisbon',
  brand: { accent: '#1f4e5a', coverUrl: img('photo-1559339352-11d035aa65de') },
  settings: {
    orderingEnabled: true,
    serviceNote: 'Couvert servido apenas a pedido. IVA incluído à taxa legal em vigor.',
    googleReviewUrl: 'https://g.page/r/casa-do-mar-demo/review',
  },
  plan: 'demo',
  isPublished: true,
  createdAt: '2026-01-12T10:00:00.000Z',
}

const cat = (n: number, name: string, description?: string): Category => ({
  id: `00000000-0000-4000-8000-0000000ca7${n.toString().padStart(2, '0')}`,
  restaurantId: R,
  name,
  description,
  position: n,
  isVisible: true,
})

export const categories: Category[] = [
  cat(1, 'Para começar', 'Petiscos para partilhar enquanto se escolhe.'),
  cat(2, 'Do mar', 'Peixe do dia e marisco, na brasa ou no tacho.'),
  cat(3, 'Da terra', 'Carnes maturadas e porco preto alentejano.'),
  cat(4, 'Da horta', 'Pratos vegetarianos, sem compromisso no sabor.'),
  cat(5, 'Sobremesas', 'Doçaria conventual e clássicos da casa.'),
  cat(6, 'Garrafeira & bebidas', 'Vinhos portugueses a copo e à garrafa.'),
]
const [petiscos, mar, terra, horta, doces, bebidas] = categories.map((c) => c.id)

let dishSeq = 0
function dish(d: Partial<Dish> & Pick<Dish, 'name' | 'categoryId' | 'priceCents'>): Dish {
  dishSeq += 1
  return {
    id: `00000000-0000-4000-8000-0000000d1${dishSeq.toString().padStart(3, '0')}`,
    restaurantId: R,
    description: undefined,
    allergens: [],
    ingredients: [],
    tags: [],
    options: [],
    isAvailable: true,
    isFeatured: false,
    isArchived: false,
    position: dishSeq,
    ...d,
  }
}

const doneness: OptionGroup = {
  id: 'ponto',
  name: 'Ponto da carne',
  min: 1,
  max: 1,
  choices: [
    { id: 'mal', name: 'Mal passado', priceDeltaCents: 0 },
    { id: 'medio', name: 'Médio', priceDeltaCents: 0 },
    { id: 'bem', name: 'Bem passado', priceDeltaCents: 0 },
  ],
}

const sides: OptionGroup = {
  id: 'extra',
  name: 'Acompanhamento extra',
  min: 0,
  max: 2,
  choices: [
    { id: 'batata-frita', name: 'Batata frita da casa', priceDeltaCents: 350 },
    { id: 'salada', name: 'Salada mista', priceDeltaCents: 300 },
    { id: 'arroz', name: 'Arroz de tomate', priceDeltaCents: 400 },
  ],
}

const wineFormat = (bottleDelta: number): OptionGroup => ({
  id: 'formato',
  name: 'Formato',
  min: 1,
  max: 1,
  choices: [
    { id: 'copo', name: 'Copo (15 cl)', priceDeltaCents: 0 },
    { id: 'garrafa', name: 'Garrafa (75 cl)', priceDeltaCents: bottleDelta },
  ],
})

export const dishes: Dish[] = [
  // Para começar
  dish({
    categoryId: petiscos,
    name: 'Pão da casa e manteiga de algas',
    description: 'Pão de massa-mãe de fermentação lenta, manteiga dos Açores com alga nori e flor de sal.',
    priceCents: 350,
    imageUrl: img('photo-1509440159596-0249088772ff'),
    allergens: ['gluten', 'milk'],
    ingredients: ['pão de massa-mãe', 'manteiga dos Açores', 'alga nori', 'flor de sal'],
    tags: ['vegetarian', 'to_share'],
    prepMinutes: 3,
  }),
  dish({
    categoryId: petiscos,
    name: 'Amêijoas à Bulhão Pato',
    description: 'Amêijoa-boa da Ria Formosa, alho, coentros, azeite e um toque de limão. Pão para molhar.',
    priceCents: 1650,
    imageUrl: img('photo-1625943553852-781c6dd46faa'),
    allergens: ['molluscs', 'gluten'],
    ingredients: ['amêijoa-boa', 'alho', 'coentros', 'azeite', 'limão', 'vinho branco'],
    tags: ['signature', 'popular', 'to_share'],
    pairing: 'Vinho Verde Alvarinho',
    prepMinutes: 10,
    isFeatured: true,
  }),
  dish({
    categoryId: petiscos,
    name: 'Pastéis de bacalhau',
    description: 'Quatro unidades, fritos na hora. Bacalhau desfiado, batata e salsa, com maionese de limão.',
    priceCents: 750,
    imageUrl: img('photo-1606755962773-d324e0a13086'),
    allergens: ['fish', 'eggs', 'gluten'],
    ingredients: ['bacalhau', 'batata', 'ovo', 'salsa', 'cebola', 'limão'],
    tags: ['popular', 'to_share'],
    pairing: 'Vinho Verde ou cerveja',
    prepMinutes: 8,
    model: model('pasteis-de-bacalhau'),
  }),
  dish({
    categoryId: petiscos,
    name: 'Camarão ao alho',
    description: 'Camarão de Moçambique salteado em azeite, alho laminado, malagueta e cerveja.',
    priceCents: 1450,
    imageUrl: img('photo-1565680018434-b513d5e5fd47'),
    allergens: ['crustaceans', 'gluten'],
    ingredients: ['camarão', 'alho', 'malagueta', 'azeite', 'cerveja', 'coentros'],
    tags: ['spicy', 'to_share'],
    pairing: 'Alvarinho ou rosé',
    prepMinutes: 9,
  }),
  dish({
    categoryId: petiscos,
    name: 'Peixinhos da horta',
    description: 'Feijão-verde em polme leve e estaladiço, maionese de ervas.',
    priceCents: 800,
    imageUrl: img('photo-1541014741259-de529411b96a'),
    allergens: ['gluten', 'eggs'],
    ingredients: ['feijão-verde', 'farinha de trigo', 'ovo', 'ervas aromáticas'],
    tags: ['vegetarian', 'to_share'],
    prepMinutes: 8,
  }),

  // Do mar
  dish({
    categoryId: mar,
    name: 'Polvo à lagareiro',
    description:
      'Polvo cozido lentamente e acabado na brasa, batata a murro, grelos salteados e azeite virgem extra com alho.',
    priceCents: 2450,
    imageUrl: img('photo-1599487488170-d11ec9c172f0'),
    allergens: ['molluscs'],
    ingredients: ['polvo', 'batata-nova', 'grelos', 'alho', 'azeite virgem extra', 'louro'],
    tags: ['signature', 'popular', 'gluten_free'],
    pairing: 'Alvarinho ou um branco do Douro com alguma estrutura',
    prepMinutes: 20,
    isFeatured: true,
  }),
  dish({
    categoryId: mar,
    name: 'Arroz de marisco',
    description: 'Para duas pessoas. Arroz carolino malandrinho com lagosta, camarão, amêijoa e mexilhão, no tacho.',
    priceCents: 5200,
    imageUrl: img('photo-1534080564583-6be75777b70a'),
    allergens: ['crustaceans', 'molluscs', 'celery'],
    ingredients: ['arroz carolino', 'lagosta', 'camarão', 'amêijoa', 'mexilhão', 'tomate', 'coentros'],
    tags: ['signature', 'to_share'],
    pairing: 'Alvarinho ou espumante da Bairrada',
    prepMinutes: 30,
    isFeatured: true,
  }),
  dish({
    categoryId: mar,
    name: 'Bacalhau à Brás',
    description: 'Bacalhau desfiado, batata palha fina, ovo cremoso, azeitonas pretas e salsa.',
    priceCents: 1750,
    imageUrl: img('photo-1512058564366-18510be2db19'),
    allergens: ['fish', 'eggs'],
    ingredients: ['bacalhau', 'batata palha', 'ovo', 'cebola', 'azeitona preta', 'salsa'],
    tags: ['popular'],
    pairing: 'Branco do Dão ou Vinho Verde',
    prepMinutes: 15,
  }),
  dish({
    categoryId: mar,
    name: 'Dourada escalada na brasa',
    description: 'Dourada inteira de mar, escalada e grelhada em carvão de azinho, legumes salteados e batata cozida.',
    priceCents: 1950,
    imageUrl: img('photo-1519708227418-c8fd9a32b7a2'),
    allergens: ['fish'],
    ingredients: ['dourada', 'batata', 'legumes da época', 'azeite', 'limão'],
    tags: ['light', 'gluten_free'],
    pairing: 'Vinho Verde Loureiro',
    options: [sides],
    prepMinutes: 18,
  }),
  dish({
    categoryId: mar,
    name: 'Lulas grelhadas',
    description: 'Lulas da costa grelhadas inteiras, molho de manteiga e limão, arroz de coentros.',
    priceCents: 1800,
    imageUrl: img('photo-1604909052743-94e838986d24'),
    allergens: ['molluscs', 'milk'],
    ingredients: ['lulas', 'manteiga', 'limão', 'arroz', 'coentros'],
    tags: ['light'],
    pairing: 'Branco de Bucelas (Arinto)',
    prepMinutes: 14,
  }),

  // Da terra
  dish({
    categoryId: terra,
    name: 'Bife à Casa do Mar',
    description: 'Novilho maturado 30 dias, molho de manteiga e alho, ovo estrelado e batata frita da casa.',
    priceCents: 2400,
    imageUrl: img('photo-1600891964092-4316c288032e'),
    allergens: ['milk', 'eggs', 'sulphites'],
    ingredients: ['novilho maturado', 'manteiga', 'alho', 'ovo', 'batata', 'vinho branco'],
    tags: ['popular'],
    pairing: 'Tinto do Douro ou Alentejo',
    options: [doneness, sides],
    prepMinutes: 16,
  }),
  dish({
    categoryId: terra,
    name: 'Secretos de porco preto',
    description: 'Porco preto alentejano na brasa, migas de espargos e laranja.',
    priceCents: 1950,
    imageUrl: img('photo-1544025162-d76694265947'),
    allergens: ['gluten'],
    ingredients: ['porco preto', 'pão alentejano', 'espargos', 'alho', 'laranja'],
    tags: ['signature'],
    pairing: 'Tinto do Alentejo',
    prepMinutes: 16,
  }),

  // Da horta
  dish({
    categoryId: horta,
    name: 'Arroz de tomate e cogumelos',
    description: 'Arroz malandrinho de tomate maduro, cogumelos salteados, ovo a baixa temperatura e poejo.',
    priceCents: 1500,
    imageUrl: img('photo-1476124369491-e7addf5db371'),
    allergens: ['eggs', 'celery'],
    ingredients: ['arroz carolino', 'tomate', 'cogumelos', 'ovo', 'poejo', 'cebola'],
    tags: ['vegetarian', 'gluten_free'],
    pairing: 'Rosé ou branco leve',
    prepMinutes: 22,
  }),
  dish({
    categoryId: horta,
    name: 'Salada de grão, abóbora e romã',
    description: 'Grão-de-bico, abóbora assada, rúcula, romã, sementes tostadas e vinagrete de citrinos.',
    priceCents: 1300,
    imageUrl: img('photo-1512621776951-a57141f2eefd'),
    allergens: ['sesame', 'mustard'],
    ingredients: ['grão-de-bico', 'abóbora', 'rúcula', 'romã', 'sésamo', 'sementes de abóbora', 'laranja'],
    tags: ['vegan', 'light', 'gluten_free'],
    pairing: 'Vinho Verde',
    prepMinutes: 8,
  }),

  // Sobremesas
  dish({
    categoryId: doces,
    name: 'Pastel de nata',
    description: 'Massa folhada estaladiça e creme de ovo, feito todas as manhãs. Canela e açúcar em pó à parte.',
    priceCents: 220,
    imageUrl: img('photo-1587241321921-91a834d6d191'),
    allergens: ['gluten', 'eggs', 'milk'],
    ingredients: ['massa folhada', 'ovo', 'leite', 'açúcar', 'canela', 'limão'],
    tags: ['popular', 'vegetarian'],
    pairing: 'Café ou Porto Tawny',
    prepMinutes: 2,
    model: model('pastel-de-nata'),
    isFeatured: true,
  }),
  dish({
    categoryId: doces,
    name: 'Pudim Abade de Priscos',
    description: 'O pudim conventual de Braga: gemas, caramelo, vinho do Porto e um segredo de toucinho.',
    priceCents: 650,
    imageUrl: img('photo-1528975604071-b4dc52a2d18c'),
    allergens: ['eggs', 'sulphites'],
    ingredients: ['gemas', 'açúcar', 'vinho do Porto', 'toucinho', 'limão', 'canela'],
    tags: ['signature', 'gluten_free'],
    pairing: 'Porto Tawny 10 anos',
    prepMinutes: 2,
    model: model('pudim-abade-de-priscos'),
  }),
  dish({
    categoryId: doces,
    name: 'Mousse de chocolate e flor de sal',
    description: 'Chocolate negro 70%, azeite e flor de sal de Castro Marim.',
    priceCents: 600,
    imageUrl: img('photo-1541783245831-57d6fb0926d3'),
    allergens: ['eggs', 'milk'],
    ingredients: ['chocolate negro 70%', 'ovo', 'natas', 'azeite', 'flor de sal'],
    tags: ['vegetarian', 'gluten_free'],
    pairing: 'Porto Ruby ou Moscatel de Setúbal',
    prepMinutes: 2,
  }),

  // Garrafeira & bebidas
  dish({
    categoryId: bebidas,
    name: 'Soalheiro Alvarinho',
    description: 'Vinho Verde, Monção e Melgaço. Fresco, mineral, citrino. Feito para o marisco.',
    priceCents: 650,
    imageUrl: img('photo-1510812431401-41d2bd2722f3'),
    allergens: ['sulphites'],
    ingredients: ['uva Alvarinho'],
    tags: ['popular', 'vegan'],
    options: [wineFormat(2150)],
    prepMinutes: 1,
  }),
  dish({
    categoryId: bebidas,
    name: 'Quinta do Crasto Tinto',
    description: 'Douro. Fruta vermelha, taninos suaves e final longo. Para carnes e pratos de tacho.',
    priceCents: 700,
    imageUrl: img('photo-1553361371-9b22f78e8b1d'),
    allergens: ['sulphites'],
    ingredients: ['Touriga Nacional', 'Touriga Franca', 'Tinta Roriz'],
    tags: ['vegan'],
    options: [wineFormat(2500)],
    prepMinutes: 1,
  }),
  dish({
    categoryId: bebidas,
    name: 'Limonada de hortelã',
    description: 'Limão espremido na hora, hortelã fresca e água com gás.',
    priceCents: 400,
    imageUrl: img('photo-1523371054106-bbf80586c38c'),
    ingredients: ['limão', 'hortelã', 'água com gás', 'açúcar de cana'],
    tags: ['vegan', 'light'],
    prepMinutes: 3,
  }),
  dish({
    categoryId: bebidas,
    name: 'Água das Pedras',
    description: 'Água mineral gasocarbónica natural, 25 cl.',
    priceCents: 250,
    ingredients: ['água mineral natural'],
    tags: ['vegan'],
    prepMinutes: 1,
  }),
  dish({
    categoryId: bebidas,
    name: 'Café',
    description: 'Lote da casa, torra média. Pergunte pelo pingado ou pelo galão.',
    priceCents: 120,
    ingredients: ['café'],
    tags: ['vegan'],
    prepMinutes: 1,
  }),
]

const table = (n: number, label: string, area: string, seats: number, token: string): RestaurantTable => ({
  id: `00000000-0000-4000-8000-0000000ab${n.toString().padStart(3, '0')}`,
  restaurantId: R,
  label,
  area,
  seats,
  qrToken: token,
  isActive: true,
  position: n,
})

export const tables: RestaurantTable[] = [
  table(1, 'Mesa 1', 'Sala', 2, 'k7Qm2xLp4sVa'),
  table(2, 'Mesa 2', 'Sala', 4, 'Zr8nT3wYb6Ce'),
  table(3, 'Mesa 3', 'Sala', 4, 'Hd2vP9qMx4Ls'),
  table(4, 'Mesa 4', 'Sala', 6, 'Wb5kJ7sRn2Tf'),
  table(5, 'Mesa 5', 'Sala', 2, 'Pq4cX8mVz3Ng'),
  table(6, 'Mesa 6', 'Sala', 8, 'Ty6hB2rKd9Mu'),
  table(7, 'Esplanada 1', 'Esplanada', 2, 'Ne3wF5tQj7Ya'),
  table(8, 'Esplanada 2', 'Esplanada', 4, 'Gs9pL4xCv2Hb'),
  table(9, 'Esplanada 3', 'Esplanada', 4, 'Uc7mD3nWq8Ze'),
  table(10, 'Balcão', 'Bar', 3, 'Aj2rV6yTk5Pf'),
]
