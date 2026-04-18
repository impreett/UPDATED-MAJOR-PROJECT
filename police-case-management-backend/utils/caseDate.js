const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseCaseDate(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        const match = DATE_ONLY_REGEX.exec(trimmed);
        if (match) {
            const year = Number(match[1]);
            const month = Number(match[2]) - 1;
            const day = Number(match[3]);
            const parsed = new Date(year, month, day);
            if (
                parsed.getFullYear() !== year ||
                parsed.getMonth() !== month ||
                parsed.getDate() !== day
            ) {
                return null;
            }
            return parsed;
        }

        const parsed = new Date(trimmed);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function validateCaseDateNotFuture(value) {
    const parsed = parseCaseDate(value);
    if (!parsed) {
        return 'Case date is invalid.';
    }

    const caseDay = new Date(
        parsed.getFullYear(),
        parsed.getMonth(),
        parsed.getDate()
    ).getTime();

    const now = new Date();
    const today = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
    ).getTime();

    if (caseDay > today) {
        return 'Case date cannot be in the future.';
    }

    return '';
}

module.exports = {
    validateCaseDateNotFuture,
};
