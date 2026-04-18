const toPositiveInteger = (value, fallback) => {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return parsed;
};

const defaultFromEnv = toPositiveInteger(process.env.API_DEFAULT_PAGE_LIMIT, 40);
const maxFromEnv = toPositiveInteger(process.env.API_MAX_PAGE_LIMIT, 200);

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const parsePagination = (query = {}, options = {}) => {
    const configuredDefaultLimit = toPositiveInteger(options.defaultLimit, defaultFromEnv);
    const configuredMaxLimit = toPositiveInteger(options.maxLimit, maxFromEnv);
    const maxLimit = Math.max(configuredDefaultLimit, configuredMaxLimit);
    const defaultLimit = clamp(configuredDefaultLimit, 1, maxLimit);

    const page = toPositiveInteger(query.page, 1);
    const rawLimit = query.limit;
    const limitText = String(rawLimit ?? '').trim().toLowerCase();
    if (limitText === '0' || limitText === 'all') {
        return { page: 1, limit: 0, skip: 0 };
    }

    const requestedLimit = toPositiveInteger(rawLimit, defaultLimit);
    const limit = clamp(requestedLimit, 1, maxLimit);
    const skip = (page - 1) * limit;

    return { page, limit, skip };
};

const setPaginationHeaders = (res, pagination) => {
    res.set('X-Page', String(pagination.page));
    res.set('X-Limit', String(pagination.limit));
};

module.exports = {
    parsePagination,
    setPaginationHeaders,
};
