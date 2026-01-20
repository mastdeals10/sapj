/**
 * Centralized currency formatting utilities
 * Ensures consistent decimal place display across the application
 */

export const formatCurrency = (amount: number | string | null | undefined, currency: string = 'IDR'): string => {
  const numAmount = Number(amount) || 0;

  if (currency === 'USD' || currency === 'usd') {
    return `$ ${numAmount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }

  // Default to IDR
  return `Rp ${numAmount.toLocaleString('id-ID', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

export const formatNumber = (amount: number | string | null | undefined, decimals: number = 2): string => {
  const numAmount = Number(amount) || 0;
  return numAmount.toLocaleString('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

export const formatPercentage = (value: number | string | null | undefined, decimals: number = 2): string => {
  const numValue = Number(value) || 0;
  return `${numValue.toLocaleString('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}%`;
};
